import { isEconomyUnit } from "../economy/records";
import type { SimWorldState } from "../sim/world";
import { openCultivation, saveCultivation } from "./sliceCultivation";
import { sliceState } from "./sliceState";

/**
 * Permanently removes living Hold units without counting them as combat
 * losses. Population is derived from `world.units`, so removal frees each
 * unit's weight. Active breakthroughs are resolved as failed to release their
 * reservations, and equipped treasures drop just as they do on death. Owner
 * ids remain for the normal combat pruning pass so lingering burns retain
 * their co-op score attribution.
 * @param world - Sim world whose units and dependent records change
 * @param unitIds - Authorized Hold unit ids to remove
 * @returns How many living units were disbanded
 */
export function disbandHoldUnits(
  world: SimWorldState,
  unitIds: readonly string[],
): number {
  const requested = new Set(unitIds);
  const removed = world.units.filter(
    (unit) => requested.has(unit.id) && isEconomyUnit(unit) && unit.hp > 0,
  );
  if (removed.length === 0) return 0;

  const state = sliceState(world);
  const cultivation = openCultivation(world);
  for (const unit of removed) {
    if (cultivation.hasUnit(unit.id)) {
      cultivation.onUnitDeath(unit.id);
      cultivation.removeUnit(unit.id);
    }
    delete state.combat.bodies[unit.id];
    delete state.cultivatorPowers?.[unit.id];
    delete state.injuries[unit.id];
    delete state.lastHitTick[unit.id];
    delete state.waypoints?.[unit.id];
  }
  saveCultivation(world, cultivation);

  const removedIds = new Set(removed.map((unit) => unit.id));
  world.units = world.units.filter((unit) => !removedIds.has(unit.id));
  state.combat.pendingOrders = state.combat.pendingOrders.flatMap((order) => {
    const remainingIds = order.unitIds.filter((id) => !removedIds.has(id));
    if (remainingIds.length === 0) return [];
    if (remainingIds.length === order.unitIds.length) return [order];
    return [{ ...order, unitIds: remainingIds }];
  });
  state.combat.projectiles = state.combat.projectiles.filter(
    (projectile) =>
      !removedIds.has(projectile.sourceId) &&
      !removedIds.has(projectile.targetId),
  );
  return removed.length;
}
