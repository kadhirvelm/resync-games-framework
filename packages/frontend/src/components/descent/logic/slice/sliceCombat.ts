import { ASHEN_GATE_MAP } from "../../data/layers/ashen_gate";
import { CombatSimulation, createCombatUnit } from "../combat/combatSimulation";
import { getClassCounterMultiplier } from "../combat/counters";
import type {
  CombatBuilding,
  CombatClassId,
  CombatEvent,
  CombatUnit,
} from "../combat/types";
import { getUnitDefinition } from "../combat/unitCatalog";
import { damageBuilding } from "../economy/actions";
import type { EconomyUnit } from "../economy/model";
import { addItem } from "../economy/queries";
import { asBuilding, economyHost, isEconomyUnit } from "../economy/records";
import { buildingDef } from "../economy/tables";
import { activeVentVolumes, environmentAt } from "../layers/hazards";
import { LAYER_TABLE } from "../layers/layerTable";
import type { HazardId, LayerBuilding } from "../layers/layerTypes";
import { TICK_MS, TICKS_PER_SECOND } from "../sim/constants";
import type { TickContext } from "../sim/modules";
import type { SimWorldState } from "../sim/world";
import { damageWaveUnit } from "../waves/clock";
import { BOSS_SIZE_SCALE } from "../waves/constants";
import { toCombatUnit } from "../waves/director";
import type { WaveEvent, WaveUnit } from "../waves/types";
import {
  cultivationRecord,
  cultivationStats,
  layerSchoolModifier,
  openCultivation,
  saveCultivation,
} from "./sliceCultivation";
import {
  type AshenGateSliceState,
  ECONOMY_STEP_TICKS,
  pushFx,
  pushNotice,
  sliceState,
  waveState,
} from "./sliceState";

/** Faction id of the player's bodies in combat. */
export const HOLD_FACTION = "hold";

/** Body-id prefix for a Ward Tower's turret. */
export const TOWER_PREFIX = "tower:";

/** Ward Tower turret stats. Placeholder numbers tuned for Layer 1. */
const WARD_TOWER = {
  armor: 4,
  attackRange: 8,
  attacksPerSecond: 1,
  damage: 13,
  projectileSpeed: 16,
  vision: 9,
};

/** Armor every non-tower building uses against attacks. */
const BUILDING_ARMOR = 4;

/** Seconds after a hit before a Hold unit starts regenerating. */
const REGEN_DELAY_TICKS = 5 * TICKS_PER_SECOND;

/** Out-of-combat regeneration, as a fraction of max HP per second. */
const REGEN_PER_SECOND = 0.02;

/** Radius of an ordinary body. Two ordinary bodies keep 0.7 cells apart. */
export const BODY_RADIUS = 0.35;

/** Radius of a layer boss's body. */
export const BOSS_BODY_RADIUS = BODY_RADIUS * BOSS_SIZE_SCALE;

/** Fraction of Cinderjaw's hit that splashes to other defenders. */
const BOSS_SPLASH = 0.25;

/** Most defenders one boss swing can splash. */
const BOSS_SPLASH_TARGETS = 4;

/** Merit, personal essence, and proof one kill is worth, by horde role. */
const KILL_REWARDS: Record<
  WaveUnit["role"],
  { essence: number; merit: number; proof: number }
> = {
  boss: { essence: 60, merit: 150, proof: 3 },
  elite: { essence: 20, merit: 40, proof: 2 },
  escort: { essence: 6, merit: 12, proof: 1 },
  fodder: { essence: 1, merit: 3, proof: 0 },
  scout: { essence: 6, merit: 12, proof: 1 },
  swarm: { essence: 6, merit: 12, proof: 1 },
  vent_imp: { essence: 2, merit: 5, proof: 0 },
};

/** Radius in which allies share a kill. */
const SHARE_RADIUS = 7;

/**
 * Runs hazards, one combat tick, and every consequence of it.
 * @param context - Current tick
 */
export function runCombatTick(context: TickContext): void {
  const world = context.world;
  const state = sliceState(world);
  applyHazards(world);
  refreshHoldStats(world);
  const roster = buildRoster(world, state);
  const targets = buildingTargets(world);
  const simulation = new CombatSimulation({
    buildings: targets,
    hurtZones: activeVentVolumes(world.layerId),
    pendingProjectiles: state.combat.projectiles,
    startTick: state.combat.tick,
    tickMs: TICK_MS,
    units: roster,
  });
  for (const order of state.combat.pendingOrders) {
    simulation.enqueueCommand(order, HOLD_FACTION);
  }
  state.combat.pendingOrders = [];
  const events = simulation.advanceTick();
  const after = simulation.exportState();
  state.combat.projectiles = after.pendingProjectiles;
  state.combat.tick = after.tick;
  const bodies = new Map(after.units.map((unit) => [unit.id, unit]));
  const previous = new Map(roster.map((unit) => [unit.id, unit]));
  recordFx(world, events, bodies);
  applyBossSplash(world, events, bodies);
  writeHoldBodies(world, bodies, previous);
  writeBuildings(world, after.buildings, targets);
  const waveEvents = writeHorde(context, events, bodies, previous);
  for (const event of waveEvents) applyWaveEvent(context, event);
  blockAtWalls(world, previous);
  separateBodies(world);
  regenerate(world);
  settleHoldDeaths(world);
  state.combat.bodies = {};
  for (const unit of after.units) {
    if (unit.hitPoints <= 0) continue;
    state.combat.bodies[unit.id] = unit;
  }
}

/**
 * Builds the combat roster from the world's current records.
 * @param world - Sim world
 * @param state - Slice state with saved combat bodies
 * @returns One body per soldier, villager, tower, and horde unit
 */
function buildRoster(
  world: SimWorldState,
  state: AshenGateSliceState,
): CombatUnit[] {
  const saved = state.combat.bodies;
  const roster: CombatUnit[] = [];
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0) continue;
    roster.push(holdBody(world, unit, saved[unit.id]));
  }
  for (const building of world.buildings) {
    const record = asBuilding(building);
    if (record.buildingType !== "ward_tower" || !record.completed) continue;
    roster.push(towerBody(record, saved[TOWER_PREFIX + record.id]));
  }
  const rally = rallyPoint(world);
  for (const unit of waveState(world).units) {
    roster.push(hordeBody(world, unit, saved[unit.id], rally));
  }
  return roster;
}

/**
 * Builds a Hold body: soldiers fight, villagers only take hits.
 * @param world - Sim world
 * @param unit - Economy record
 * @param saved - Last tick's body, if any
 * @returns Combat body
 */
function holdBody(
  world: SimWorldState,
  unit: EconomyUnit,
  saved: CombatUnit | undefined,
): CombatUnit {
  if (unit.classId === "villager") {
    return {
      ...(saved ?? villagerTemplate(unit)),
      hitPoints: unit.hp,
      maxHitPoints: unit.maxHp,
      position: { x: unit.x, y: unit.y },
    };
  }
  const definition = getUnitDefinition(unit.classId as CombatClassId);
  const record = cultivationRecord(world, unit.id);
  const stats = cultivationStats(record);
  const schoolBoost = record?.school
    ? layerSchoolModifier(world, record.school) * stats.schoolEffect
    : 1;
  const base =
    saved ??
    createCombatUnit(definition, {
      factionId: HOLD_FACTION,
      id: unit.id,
      position: { x: unit.x, y: unit.y },
    });
  return {
    ...base,
    damage: round(definition.damage * stats.damage * schoolBoost),
    hasLongLife: record?.rank === "Champion" || record?.rank === "Ascended",
    hitPoints: unit.hp,
    maxHitPoints: unit.maxHp,
    position: { x: unit.x, y: unit.y },
    rankTitle: record?.rank ?? "Ashborn",
    school: record?.school,
    speed: round(definition.speed * stats.moveSpeed),
  };
}

/**
 * A villager body: it never attacks or moves in combat (economy walks it).
 * @param unit - Villager record
 * @returns Passive combat body
 */
function villagerTemplate(unit: EconomyUnit): CombatUnit {
  return {
    armor: 0,
    attackCooldownMs: 0,
    attackKind: "melee",
    attackRange: -1,
    attacksPerSecond: 1,
    classId: "villager",
    damage: 0,
    factionId: HOLD_FACTION,
    hitPoints: unit.hp,
    id: unit.id,
    maxHitPoints: unit.maxHp,
    merit: 0,
    popCost: 1,
    position: { x: unit.x, y: unit.y },
    rankTitle: "Ashborn",
    speed: 0,
    statuses: {},
    structureDamageMultiplier: 0,
    vision: -1,
  };
}

/**
 * A Ward Tower turret. Its HP mirrors the building.
 * @param tower - Completed Ward Tower
 * @param saved - Last tick's turret, if any
 * @returns Static ranged body
 */
function towerBody(
  tower: ReturnType<typeof asBuilding>,
  saved: CombatUnit | undefined,
): CombatUnit {
  const auraBonus = tower.bonuses.adjacency.some(
    (flag) => flag.id === "ward_damage_aura",
  )
    ? 1.1
    : 1;
  return {
    armor: WARD_TOWER.armor,
    attackCooldownMs: saved?.attackCooldownMs ?? 0,
    attackKind: "projectile",
    attackRange: WARD_TOWER.attackRange,
    attacksPerSecond: WARD_TOWER.attacksPerSecond,
    classId: "hunter",
    damage: round(WARD_TOWER.damage * auraBonus),
    factionId: HOLD_FACTION,
    hitPoints: tower.hp,
    id: TOWER_PREFIX + tower.id,
    maxHitPoints: tower.maxHp,
    merit: 0,
    popCost: 0,
    position: { x: tower.x, y: tower.y },
    projectileSpeed: WARD_TOWER.projectileSpeed,
    rankTitle: "Ashborn",
    speed: 0,
    statuses: saved?.statuses ?? {},
    structureDamageMultiplier: 0,
    vision: WARD_TOWER.vision,
  };
}

/**
 * A horde body. The wave clock owns its HP and stats; combat owns its
 * cooldowns, statuses, and order. Siege bodies go for walls first.
 * @param world - Sim world
 * @param unit - Wave unit
 * @param saved - Last tick's body, if any
 * @param rally - Where the horde is marching
 * @returns Combat body with a fresh march order when idle
 */
function hordeBody(
  world: SimWorldState,
  unit: WaveUnit,
  saved: CombatUnit | undefined,
  rally: { x: number; y: number },
): CombatUnit {
  const fresh = toCombatUnit(unit);
  const body: CombatUnit = saved
    ? {
        ...saved,
        armor: fresh.armor,
        damage: fresh.damage,
        hitPoints: unit.hitPoints,
        maxHitPoints: unit.maxHitPoints,
        position: { x: unit.x, y: unit.y },
        speed: fresh.speed,
      }
    : fresh;
  if (unit.preferredTarget === "wall") {
    const wall = nearestBuilding(world, unit, isBarrier);
    if (wall) {
      body.order = { targetId: wall.id, type: "attack_target" };
      return body;
    }
  }
  if (unit.role === "boss") body.bodyRadius = BOSS_BODY_RADIUS - BODY_RADIUS;
  if (body.order?.type === "attack_target") return body;
  if (body.order?.type === "attack_move") {
    body.order = { ...body.order, destination: rally };
    return body;
  }
  body.order = { destination: rally, type: "attack_move" };
  return body;
}

/**
 * Where the horde marches: the Camp, else the nearest Hold building.
 * @param world - Sim world
 * @returns March destination
 */
function rallyPoint(world: SimWorldState): { x: number; y: number } {
  const camp = world.buildings.find((entry) => entry.buildingType === "camp");
  if (camp) return { x: camp.x, y: camp.y };
  const any = world.buildings[0];
  if (any) return { x: any.x, y: any.y };
  return { x: 0, y: world.map.height / 2 };
}

/**
 * Hold buildings the horde can hit. Completed Ward Towers fight as turrets
 * instead, so they are left out here.
 * @param world - Sim world
 * @returns Combat building targets
 */
function buildingTargets(world: SimWorldState): CombatBuilding[] {
  return world.buildings.flatMap((building) => {
    const record = asBuilding(building);
    if (record.buildingType === "ward_tower" && record.completed) return [];
    return [
      {
        armor: BUILDING_ARMOR,
        factionId: HOLD_FACTION,
        hitPoints: record.hp,
        id: record.id,
        maxHitPoints: record.maxHp,
        position: { x: record.x, y: record.y },
      },
    ];
  });
}

/**
 * Applies realm, pill, and fed bonuses to each soldier's max HP. HP scales
 * with it so a promotion or ration never reads as damage.
 * @param world - Sim world
 */
function refreshHoldStats(world: SimWorldState): void {
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0) continue;
    if (unit.classId === "villager") continue;
    const definition = getUnitDefinition(unit.classId as CombatClassId);
    const stats = cultivationStats(cultivationRecord(world, unit.id));
    const fed = fedHealthBonus(unit);
    const maxHp = round(definition.maxHitPoints * stats.maxHealth * (1 + fed));
    if (maxHp === unit.maxHp) continue;
    unit.hp = round((unit.hp / unit.maxHp) * maxHp);
    unit.maxHp = maxHp;
  }
}

/**
 * @param unit - Economy record
 * @returns Health bonus from active rations, 0 when unfed
 */
function fedHealthBonus(unit: EconomyUnit): number {
  return unit.modifiers.reduce(
    (sum, modifier) => sum + modifier.healthBonus,
    0,
  );
}

/**
 * @param unit - Economy record
 * @returns Regen bonus from active rations, 0 when unfed
 */
function fedRegenBonus(unit: EconomyUnit): number {
  return unit.modifiers.reduce((sum, modifier) => sum + modifier.regenBonus, 0);
}

/**
 * Burns every body standing in an Ember vent (fire-ward walls mitigate).
 * @param world - Sim world
 */
function applyHazards(world: SimWorldState): void {
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === world.layerId);
  const hazards: readonly HazardId[] = layer?.hazards ?? [];
  if (hazards.length === 0) return;
  const context = {
    activeHazards: hazards,
    buildings: layerBuildings(world),
    table: LAYER_TABLE,
    ventVolumes: ASHEN_GATE_MAP.vents,
  };
  const seconds = TICK_MS / 1_000;
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0) continue;
    const school = cultivationRecord(world, unit.id)?.school;
    const burn = environmentAt(context, { school, x: unit.x, y: unit.y });
    if (burn.burnPerSecond <= 0) continue;
    unit.hp = Math.max(0, unit.hp - burn.burnPerSecond * seconds);
    sliceState(world).lastHitTick[unit.id] = world.tick;
  }
  const waves = waveState(world);
  for (const unit of [...waves.units]) {
    const burn = environmentAt(context, {
      school: unit.school ?? undefined,
      x: unit.x,
      y: unit.y,
    });
    if (burn.burnPerSecond <= 0) continue;
    damageWaveUnit(waves, unit.id, burn.burnPerSecond * seconds, "spell");
  }
}

/**
 * Converts economy buildings into the hazard seam's shape.
 * @param world - Sim world
 * @returns Hazard-readable structures
 */
function layerBuildings(world: SimWorldState): LayerBuilding[] {
  return world.buildings.map((building) => {
    const record = asBuilding(building);
    return {
      buildingType: record.buildingType,
      constructed: record.completed,
      x: record.x,
      y: record.y,
    };
  });
}

/**
 * Copies Hold soldier positions and every Hold body's HP back to the world.
 * @param world - Sim world
 * @param bodies - Bodies after the tick
 * @param previous - Bodies before the tick
 */
function writeHoldBodies(
  world: SimWorldState,
  bodies: ReadonlyMap<string, CombatUnit>,
  previous: ReadonlyMap<string, CombatUnit>,
): void {
  const state = sliceState(world);
  for (const unit of world.units) {
    if (!isEconomyUnit(unit)) continue;
    const body = bodies.get(unit.id);
    if (!body) continue;
    const before = previous.get(unit.id)?.hitPoints ?? body.hitPoints;
    if (body.hitPoints < before) state.lastHitTick[unit.id] = world.tick;
    unit.hp = Math.max(0, Math.min(unit.maxHp, body.hitPoints));
    if (unit.classId === "villager") continue;
    unit.x = clamp(body.position.x, 0, world.map.width - 1);
    unit.y = clamp(body.position.y, 0, world.map.height - 1);
  }
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  for (const [id, body] of bodies) {
    if (!id.startsWith(TOWER_PREFIX)) continue;
    const before = previous.get(id)?.hitPoints ?? body.hitPoints;
    const lost = before - body.hitPoints;
    if (lost <= 0) continue;
    const buildingId = id.slice(TOWER_PREFIX.length);
    damageWithNotice(world, host, buildingId, lost);
  }
}

/**
 * Applies building damage from the tick through the economy (so a volatile
 * Furnace still splashes its neighbours).
 * @param world - Sim world
 * @param after - Buildings after the tick
 * @param before - Buildings before the tick
 */
function writeBuildings(
  world: SimWorldState,
  after: readonly CombatBuilding[],
  before: readonly CombatBuilding[],
): void {
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const start = new Map(before.map((entry) => [entry.id, entry.hitPoints]));
  for (const building of after) {
    const lost =
      (start.get(building.id) ?? building.hitPoints) - building.hitPoints;
    if (lost <= 0) continue;
    damageWithNotice(world, host, building.id, lost);
  }
}

/**
 * Damages a building and announces it if it falls.
 * @param world - Sim world
 * @param host - Economy host
 * @param buildingId - Building hit
 * @param amount - Damage dealt
 */
function damageWithNotice(
  world: SimWorldState,
  host: ReturnType<typeof economyHost>,
  buildingId: string,
  amount: number,
): void {
  const building = world.buildings.find((entry) => entry.id === buildingId);
  if (!building) return;
  damageBuilding(host, buildingId, amount);
  if (world.buildings.some((entry) => entry.id === buildingId)) return;
  const name = buildingDef(building.buildingType)?.name ?? "A building";
  pushNotice(world, `${name} has fallen.`, "bad");
  pushFx(world, { kind: "collapse", x: building.x, y: building.y });
}

/**
 * Moves horde bodies and routes their damage through the wave clock, which
 * applies elite resistances, boss phases, and essence payouts.
 * @param context - Current tick
 * @param events - Combat events from the tick
 * @param bodies - Bodies after the tick
 * @param previous - Bodies before the tick
 * @returns Wave events raised by the damage
 */
function writeHorde(
  context: TickContext,
  events: readonly CombatEvent[],
  bodies: ReadonlyMap<string, CombatUnit>,
  previous: ReadonlyMap<string, CombatUnit>,
): WaveEvent[] {
  const world = context.world;
  const waves = waveState(world);
  const lastHitter = new Map<string, string>();
  const spellOnly = new Map<string, boolean>();
  for (const event of events) {
    if (event.kind !== "damage_applied") continue;
    lastHitter.set(event.targetId, event.sourceId);
    const source = bodies.get(event.sourceId) ?? previous.get(event.sourceId);
    const spell = source?.classId === "adept";
    spellOnly.set(
      event.targetId,
      (spellOnly.get(event.targetId) ?? true) && spell,
    );
  }
  const waveEvents: WaveEvent[] = [];
  for (const unit of [...waves.units]) {
    const body = bodies.get(unit.id);
    if (!body) continue;
    unit.x = clamp(body.position.x, 0, world.map.width - 1);
    unit.y = clamp(body.position.y, 0, world.map.height - 1);
    const before = previous.get(unit.id)?.hitPoints ?? unit.hitPoints;
    const delta = before - body.hitPoints;
    if (delta < 0) {
      unit.hitPoints = Math.min(unit.maxHitPoints, unit.hitPoints - delta);
      continue;
    }
    if (delta === 0) continue;
    const kind = spellOnly.get(unit.id) ? "spell" : "physical";
    // Combat caps a hit at the body's remaining HP. When it killed the body,
    // pass enough to finish it even through the Armored resistance.
    const amount = body.hitPoints <= 0 ? unit.hitPoints * 2 + 1 : delta;
    const raised = damageWaveUnit(waves, unit.id, amount, kind);
    waveEvents.push(...raised);
    const died = !waves.units.some((entry) => entry.id === unit.id);
    if (!died) continue;
    pushFx(world, { kind: "death", x: unit.x, y: unit.y });
    rewardKill(world, unit, lastHitter.get(unit.id));
  }
  return waveEvents;
}

/**
 * Pays essence and announces boss kills raised by horde damage. The waves
 * module emits its own clock events; these come from combat damage, so they
 * are re-emitted here for the view and audio.
 * @param context - Current tick
 * @param event - Wave event
 */
function applyWaveEvent(context: TickContext, event: WaveEvent): void {
  const world = context.world;
  context.emit("waves", event.type, event);
  if (event.type === "essence_payout") {
    world.resources.essence += event.amount;
    return;
  }
  if (event.type === "boss_phase") {
    pushNotice(world, "Cinderjaw roars — the vents spit imps!", "warn");
    return;
  }
  if (event.type !== "boss_killed") return;
  world.resources.essence += event.drops.essence;
  addItem(economyHost(world, ECONOMY_STEP_TICKS), event.drops.bossCoreId, 1);
  pushNotice(
    world,
    "Cinderjaw falls. The gate opens; the mouths behind it do not cheer.",
    "good",
  );
}

/**
 * Credits the killer and nearby allies with merit, personal essence, and
 * combat proof — the only way to fill the breakthrough bars.
 * @param world - Sim world
 * @param victim - Horde body that died
 * @param killerId - Body that landed the last hit, if known
 */
function rewardKill(
  world: SimWorldState,
  victim: WaveUnit,
  killerId: string | undefined,
): void {
  const state = sliceState(world);
  state.stats.kills += 1;
  const reward = KILL_REWARDS[victim.role];
  const cultivation = openCultivation(world);
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0) continue;
    if (!cultivation.hasUnit(unit.id)) continue;
    if (unit.id === killerId) {
      cultivation.awardMerit(unit.id, reward.merit);
      cultivation.awardEssence(unit.id, reward.essence);
      cultivation.recordCombatProof(unit.id, reward.proof);
      continue;
    }
    const gap = Math.hypot(unit.x - victim.x, unit.y - victim.y);
    if (gap > SHARE_RADIUS) continue;
    cultivation.awardMerit(unit.id, Math.ceil(reward.merit / 3));
    cultivation.awardEssence(unit.id, Math.ceil(reward.essence / 3));
  }
  saveCultivation(world, cultivation);
}

/**
 * Cinderjaw's swings splash defenders around the target ("AoE vs adds").
 * @param world - Sim world
 * @param events - Combat events from the tick
 * @param bodies - Bodies after the tick
 */
function applyBossSplash(
  world: SimWorldState,
  events: readonly CombatEvent[],
  bodies: ReadonlyMap<string, CombatUnit>,
): void {
  const waves = waveState(world);
  for (const event of events) {
    if (event.kind !== "attack_started") continue;
    const boss = waves.units.find(
      (unit) => unit.id === event.sourceId && unit.role === "boss",
    );
    if (!boss?.aoeRadius) continue;
    const target = bodies.get(event.targetId);
    if (!target) continue;
    const radius = boss.aoeRadius;
    const splashed = [...bodies.values()]
      .filter(
        (body) =>
          body.factionId === HOLD_FACTION &&
          body.id !== target.id &&
          !body.id.startsWith(TOWER_PREFIX) &&
          body.hitPoints > 0 &&
          gapBetween(body, target) <= radius,
      )
      .sort(
        (left, right) => gapBetween(left, target) - gapBetween(right, target),
      )
      .slice(0, BOSS_SPLASH_TARGETS);
    for (const body of splashed) {
      const splash = Math.max(1, boss.damage * BOSS_SPLASH - body.armor);
      body.hitPoints = Math.max(0, body.hitPoints - splash);
    }
    pushFx(world, {
      kind: "collapse",
      x: target.position.x,
      y: target.position.y,
    });
  }
}

/** Half-width of the square around a barrier that horde bodies may not enter. */
const BARRIER_HALF_WIDTH = 0.8;

/**
 * Whether a point lies inside any barrier's blocking square.
 * @param barriers - Standing walls, gates, and fire-ward walls
 * @param point - Map position
 * @returns The barrier containing the point, or undefined
 */
function barrierAt(
  barriers: readonly { id: string; x: number; y: number }[],
  point: { x: number; y: number },
): { id: string; x: number; y: number } | undefined {
  return barriers.find(
    (entry) =>
      Math.abs(entry.x - point.x) < BARRIER_HALF_WIDTH &&
      Math.abs(entry.y - point.y) < BARRIER_HALF_WIDTH,
  );
}

/**
 * Walls, gates, and fire-ward walls stop the horde: a body that walked into
 * one goes back and breaks it instead.
 * @param world - Sim world
 * @param previous - Bodies before the tick
 */
function blockAtWalls(
  world: SimWorldState,
  previous: ReadonlyMap<string, CombatUnit>,
): void {
  const state = sliceState(world);
  const barriers = world.buildings.filter(isBarrier);
  if (barriers.length === 0) return;
  for (const unit of waveState(world).units) {
    const wall = barrierAt(barriers, unit);
    if (!wall) continue;
    const before = previous.get(unit.id)?.position;
    if (before) {
      unit.x = before.x;
      unit.y = before.y;
    }
    const body = state.combat.bodies[unit.id];
    const order = { targetId: wall.id, type: "attack_target" as const };
    if (body) body.order = order;
    state.combat.pendingOrders.push({
      targetId: wall.id,
      type: "order_attack",
      unitIds: [unit.id],
    });
  }
}

/**
 * @param building - Any building record
 * @returns Whether it is a completed barrier the horde cannot walk through
 */
function isBarrier(building: SimWorldState["buildings"][number]): boolean {
  const record = asBuilding(building);
  if (!record.completed) return false;
  return buildingDef(record.buildingType)?.blocksHorde === true;
}

/**
 * Finds the nearest building matching a filter.
 * @param world - Sim world
 * @param origin - Search origin
 * @param accept - Filter
 * @returns Nearest match, if any
 */
function nearestBuilding(
  world: SimWorldState,
  origin: { x: number; y: number },
  accept: (building: SimWorldState["buildings"][number]) => boolean,
): SimWorldState["buildings"][number] | undefined {
  let best: SimWorldState["buildings"][number] | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const building of world.buildings) {
    if (!accept(building)) continue;
    const gap = Math.hypot(building.x - origin.x, building.y - origin.y);
    if (gap >= bestGap) continue;
    best = building;
    bestGap = gap;
  }
  return best;
}

/** A body the separation pass may push, or a fixed one it pushes others off. */
export interface SeparationBody {
  body: { x: number; y: number };
  fixed: boolean;
  /** Collision radius in map cells. */
  radius: number;
}

/**
 * How much of an overlap the first of two bodies moves. Fixed bodies never
 * move, so the other takes all of it. Two free bodies split it by weight
 * (radius squared): equal bodies split evenly, and a boss shoulders smaller
 * bodies aside while barely moving itself.
 * @param first - Body that moves back along the separating axis
 * @param second - Body that moves forward along it
 * @returns The first body's share, from zero to one
 */
function firstBodyShare(first: SeparationBody, second: SeparationBody): number {
  if (first.fixed) return 0;
  if (second.fixed) return 1;
  const firstWeight = first.radius * first.radius;
  const secondWeight = second.radius * second.radius;
  return secondWeight / (firstWeight + secondWeight);
}

/**
 * Pushes overlapping soldiers and horde bodies apart so groups read as
 * groups instead of a single stacked token. Villagers stand on economy grid
 * cells, so they are fixed: soldiers and the horde step off them instead.
 * A horde body queued against a wall is never shoved into it by the bodies
 * behind it.
 * @param world - Sim world
 */
function separateBodies(world: SimWorldState): void {
  const bodies: SeparationBody[] = [];
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0 || unit.garrisoned) continue;
    bodies.push({
      body: unit,
      fixed: unit.classId === "villager",
      radius: BODY_RADIUS,
    });
  }
  const horde = waveState(world).units;
  const hordeBefore = horde.map((unit) => ({ x: unit.x, y: unit.y }));
  for (const unit of horde) {
    bodies.push({
      body: unit,
      fixed: false,
      radius: unit.role === "boss" ? BOSS_BODY_RADIUS : BODY_RADIUS,
    });
  }
  resolveOverlaps(bodies, world.map);
  const barriers = world.buildings.filter(isBarrier);
  if (barriers.length === 0) return;
  horde.forEach((unit, index) => {
    const before = hordeBefore[index];
    if (before === undefined || barrierAt(barriers, unit) === undefined) return;
    unit.x = before.x;
    unit.y = before.y;
  });
}

/**
 * Pushes overlapping bodies apart until each pair keeps the sum of their
 * radii between them, staying inside the map.
 * @param bodies - Bodies to separate; positions are edited in place
 * @param map - Map bounds
 */
export function resolveOverlaps(
  bodies: readonly SeparationBody[],
  map: { height: number; width: number },
): void {
  for (let left = 0; left < bodies.length; left += 1) {
    const first = bodies[left] as SeparationBody;
    for (let right = left + 1; right < bodies.length; right += 1) {
      const second = bodies[right] as SeparationBody;
      if (first.fixed && second.fixed) continue;
      const a = first.body;
      const b = second.body;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const spacing = first.radius + second.radius;
      if (Math.abs(dx) >= spacing || Math.abs(dy) >= spacing) continue;
      const gap = Math.hypot(dx, dy);
      if (gap >= spacing) continue;
      const overlap = spacing - gap;
      const nx = gap === 0 ? 1 : dx / gap;
      const ny = gap === 0 ? 0 : dy / gap;
      const pushA = firstBodyShare(first, second) * overlap;
      const pushB = overlap - pushA;
      a.x = clamp(round(a.x - nx * pushA), 0, map.width - 1);
      a.y = clamp(round(a.y - ny * pushA), 0, map.height - 1);
      b.x = clamp(round(b.x + nx * pushB), 0, map.width - 1);
      b.y = clamp(round(b.y + ny * pushB), 0, map.height - 1);
    }
  }
}

/**
 * Heals Hold units that have not been hit recently. Rations raise the rate.
 * @param world - Sim world
 */
function regenerate(world: SimWorldState): void {
  const state = sliceState(world);
  const seconds = TICK_MS / 1_000;
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0 || unit.hp >= unit.maxHp) continue;
    const lastHit = state.lastHitTick[unit.id] ?? -REGEN_DELAY_TICKS;
    if (world.tick - lastHit < REGEN_DELAY_TICKS) continue;
    const rate = REGEN_PER_SECOND * (1 + fedRegenBonus(unit));
    unit.hp = Math.min(
      unit.maxHp,
      round(unit.hp + unit.maxHp * rate * seconds),
    );
  }
}

/**
 * Removes fallen Hold units, drops their treasures, and announces losses.
 * @param world - Sim world
 */
function settleHoldDeaths(world: SimWorldState): void {
  const fallen = world.units.filter(
    (unit) => isEconomyUnit(unit) && unit.hp <= 0,
  );
  if (fallen.length === 0) return;
  const state = sliceState(world);
  const cultivation = openCultivation(world);
  for (const unit of fallen) {
    pushFx(world, { kind: "death", x: unit.x, y: unit.y });
    delete state.lastHitTick[unit.id];
    delete state.injuries[unit.id];
    if (cultivation.hasUnit(unit.id)) {
      cultivation.onUnitDeath(unit.id);
      cultivation.removeUnit(unit.id);
    }
    state.stats.lost += 1;
    const name =
      unit.classId === "villager"
        ? "A villager was cut down."
        : `A ${getUnitDefinition(unit.classId as CombatClassId).name} fell.`;
    pushNotice(world, name, "bad");
  }
  saveCultivation(world, cultivation);
  const fallenIds = new Set(fallen.map((unit) => unit.id));
  world.units = world.units.filter((unit) => !fallenIds.has(unit.id));
}

/**
 * Turns combat events into short-lived renderer cues.
 * @param world - Sim world
 * @param events - Combat events from the tick
 * @param bodies - Bodies after the tick
 */
function recordFx(
  world: SimWorldState,
  events: readonly CombatEvent[],
  bodies: ReadonlyMap<string, CombatUnit>,
): void {
  for (const event of events) {
    if (event.kind === "attack_started") {
      const source = bodies.get(event.sourceId);
      const target = bodies.get(event.targetId);
      const targetPoint =
        target?.position ?? buildingPoint(world, event.targetId);
      if (!source || !targetPoint) continue;
      pushFx(world, {
        from: { ...source.position },
        kind: event.attackKind === "melee" ? "melee" : "projectile",
        to: { ...targetPoint },
      });
      continue;
    }
    if (event.kind === "damage_applied") {
      const target = bodies.get(event.targetId);
      const source = bodies.get(event.sourceId);
      if (!target || event.amount < 1) continue;
      const critical =
        source !== undefined &&
        getClassCounterMultiplier(source.classId, target.classId) > 1;
      pushFx(world, {
        amount: Math.round(event.amount),
        critical,
        kind: "damage",
        x: target.position.x,
        y: target.position.y,
      });
      continue;
    }
    if (event.kind === "unit_healed") {
      const source = bodies.get(event.sourceId);
      const target = bodies.get(event.unitId);
      if (!source || !target) continue;
      pushFx(world, {
        from: { ...source.position },
        kind: "heal",
        to: { ...target.position },
      });
    }
  }
}

/**
 * @param world - Sim world
 * @param buildingId - Building id
 * @returns Its cell, if it still stands
 */
function buildingPoint(
  world: SimWorldState,
  buildingId: string,
): { x: number; y: number } | undefined {
  const building = world.buildings.find((entry) => entry.id === buildingId);
  if (!building) return undefined;
  return { x: building.x, y: building.y };
}

/**
 * @param left - First body
 * @param right - Second body
 * @returns Distance between their positions
 */
function gapBetween(left: CombatUnit, right: CombatUnit): number {
  return Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
  );
}

/**
 * @param value - Number to clamp
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns The clamped value
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Rounds to three decimals so saves and replays stay stable.
 * @param value - Raw value
 * @returns Rounded value
 */
function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
