/**
 * Spirit Vein and adjacency flags. Recomputed every tick so a new neighbor
 * or a destroyed furnace updates the buildings around it.
 */

import { chebyshev } from "./grid";
import type { BonusFlag, EconomyBuilding, EconomyHost } from "./model";
import { asBuilding } from "./records";
import { type BuildingDef, buildingDef } from "./tables";

/**
 * Rewrites vein and adjacency flags on every building.
 * @param host - World whose buildings are updated in place
 */
export function recomputeBonuses(host: EconomyHost): void {
  for (const building of host.buildings) {
    const record = asBuilding(building);
    const def = buildingDef(record.buildingType);
    record.onSpiritVein = host.economy.veins.some(
      (vein) => vein.x === building.x && vein.y === building.y,
    );
    record.bonuses = {
      adjacency: def ? adjacencyFlags(host, record, def) : [],
      vein: veinFlag(host, record, def),
    };
  }
}

/**
 * @param host - World, read for the current hold tier
 * @param building - Building being scored
 * @param def - Its table row, if the type is known
 * @returns The vein bonus, or null when the building is off a vein
 */
function veinFlag(
  host: EconomyHost,
  building: EconomyBuilding,
  def: BuildingDef | undefined,
): BonusFlag | null {
  if (!building.onSpiritVein || !def) return null;
  const bonus =
    host.economy.tier === "Citadel" && def.veinBonusAtCitadel
      ? def.veinBonusAtCitadel
      : def.veinBonus;
  if (!bonus) return null;
  return { amount: bonus.amount, id: bonus.id, partnerId: null };
}

/**
 * @param host - World whose other buildings and nodes can partner
 * @param building - Building being scored
 * @param def - Its adjacency and aura rules
 * @returns One flag per satisfied rule
 */
function adjacencyFlags(
  host: EconomyHost,
  building: EconomyBuilding,
  def: BuildingDef,
): BonusFlag[] {
  const flags: BonusFlag[] = [];
  for (const rule of def.adjacency) {
    const partner = partnerBuilding(host, building, rule.partnerBuilding);
    const node = partnerNode(host, building, rule.partnerNodeType);
    if (!partner && !node) continue;
    flags.push({
      amount: rule.bonus.amount,
      id: rule.bonus.id,
      partnerId: partner?.id ?? node?.id ?? null,
    });
  }
  const overlap = overlapFlag(host, building, def);
  if (overlap) flags.push(overlap);
  return flags;
}

/**
 * @param host - World to search
 * @param building - Building looking for a neighbor
 * @param partnerType - Required neighbor building id, if the rule has one
 * @returns The neighboring finished building, or null. Sites under construction do not count.
 */
function partnerBuilding(
  host: EconomyHost,
  building: EconomyBuilding,
  partnerType: string | undefined,
): EconomyBuilding | null {
  if (!partnerType) return null;
  for (const other of host.buildings) {
    if (other.id === building.id) continue;
    if (other.buildingType !== partnerType) continue;
    if (chebyshev(other, building) > 1) continue;
    const partner = asBuilding(other);
    if (!partner.completed) continue;
    return partner;
  }
  return null;
}

/**
 * @param host - World whose surface nodes can satisfy a rule
 * @param building - Building looking for a node
 * @param nodeType - Required node type, if the rule has one
 * @returns The neighboring node that still has resources, or null
 */
function partnerNode(
  host: EconomyHost,
  building: EconomyBuilding,
  nodeType: string | undefined,
): { id: string } | null {
  if (!nodeType) return null;
  for (const node of host.economy.nodes) {
    if (node.nodeType !== nodeType) continue;
    if (node.remaining <= 0) continue;
    if (chebyshev(node, building) > 1) continue;
    return node;
  }
  return null;
}

/**
 * @param host - World to search for another tower
 * @param building - Tower that might share an aura
 * @param def - Aura radius and overlap bonus
 * @returns The overlap flag, or null when no other finished tower reaches this one
 */
function overlapFlag(
  host: EconomyHost,
  building: EconomyBuilding,
  def: BuildingDef,
): BonusFlag | null {
  if (def.auraRadius === null || !def.overlapBonus) return null;
  for (const other of host.buildings) {
    if (other.id === building.id) continue;
    if (other.buildingType !== building.buildingType) continue;
    if (!asBuilding(other).completed) continue;
    if (chebyshev(other, building) > def.auraRadius) continue;
    return { ...def.overlapBonus, partnerId: other.id };
  }
  return null;
}
