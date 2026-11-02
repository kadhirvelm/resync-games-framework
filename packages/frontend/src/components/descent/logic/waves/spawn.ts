import type { CombatClassId } from "../combat/types";
import { getUnitDefinition } from "../combat/unitCatalog";
import { LAYER_TABLE } from "../layers/layerTable";
import type { ClassId } from "../types";
import { getBossDefinition, getSchedule } from "./catalog";
import {
  DEFAULT_WAVE_MAP_HEIGHT,
  DEFAULT_WAVE_MAP_WIDTH,
  ELITE_STAT_SCALE,
  FODDER_STAT_SCALE,
  SPAWN_COLUMNS,
  SPAWN_EAST_INSET,
  SPAWN_EDGE_MARGIN,
  SPAWN_SPACING,
  VENT_IMP_STAT_SCALE,
} from "./constants";
import {
  applyPressure,
  hordeStatScale,
  unitSpeed,
  wavePowerMultiplier,
} from "./modifiers";
import type {
  SpawnBounds,
  SpawnPlan,
  WaveDefinition,
  WaveRole,
  WaveSchedule,
  WaveSpawnContext,
  WaveType,
  WaveUnit,
} from "./types";

/** Bounds used when a caller has no map: the live Ashen Gate size. */
export const DEFAULT_SPAWN_BOUNDS: SpawnBounds = {
  height: DEFAULT_WAVE_MAP_HEIGHT,
  width: DEFAULT_WAVE_MAP_WIDTH,
};

/**
 * Keeps a point inside `[1, width - 2] x [1, height - 2]`.
 * @param point - Desired position
 * @param bounds - Map size
 * @returns The nearest position inside the playable area
 */
export function clampToMap(
  point: { x: number; y: number },
  bounds: SpawnBounds,
): { x: number; y: number } {
  return {
    x: clampAxis(point.x, bounds.width),
    y: clampAxis(point.y, bounds.height),
  };
}

/**
 * Map slot for the nth body in a wave. Slots fill a block at the east edge:
 * columns run west from `width - 3`, and rows alternate below and above the
 * vertical centre so the block stays centred on `height / 2`.
 * @param index - Zero-based slot
 * @param bounds - Map size; defaults to the live Ashen Gate map
 * @returns Spawn position, clamped inside the map
 */
export function slotPosition(
  index: number,
  bounds: SpawnBounds = DEFAULT_SPAWN_BOUNDS,
): { x: number; y: number } {
  const column = index % SPAWN_COLUMNS;
  const row = Math.floor(index / SPAWN_COLUMNS);
  return clampToMap(
    {
      x: bounds.width - SPAWN_EAST_INSET - column * SPAWN_SPACING,
      y: bounds.height / 2 + centredRowOffset(row) * SPAWN_SPACING,
    },
    bounds,
  );
}

/**
 * Bark key for a horde body: the layer faction in snake case and the class,
 * e.g. `imp_swarm.raider` or `bone_legion.warden`. Matches the narrative
 * bark pools (`IMP_SWARM_BARKS`, `BONE_LEGION_BARKS`).
 * @param faction - Layer faction label from the layer table
 * @param classId - Combat class of the body
 * @returns Bark key
 */
export function hordeBarkKey(faction: string, classId: CombatClassId): string {
  const slug = faction
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug}.${classId}`;
}

/**
 * Builds the bodies a wave will spawn, including siege retargets.
 * Omen counts and the spawn use this same list.
 * @param schedule - Layer schedule
 * @param wave - Wave to expand
 * @returns One plan per body, elite or boss first
 */
export function plansForWave(
  schedule: WaveSchedule,
  wave: WaveDefinition,
): SpawnPlan[] {
  const plans: SpawnPlan[] = [];
  if (wave.elite) {
    plans.push(
      classPlan(wave.elite.classId, "elite", ELITE_STAT_SCALE, schedule, {
        affix: wave.elite.affix,
      }),
    );
  }
  if (wave.bossId) plans.push(bossPlan(wave.bossId));
  const role = bodyRole(wave.type);
  for (const group of wave.composition) {
    for (let index = 0; index < group.count; index += 1) {
      plans.push(
        classPlan(group.classId, role, group.statScale ?? 1, schedule),
      );
    }
  }
  if (wave.type === "swarm") {
    applySiegeFirst(
      plans,
      schedule.siegeSwarmPortion,
      schedule.lifestealClasses,
    );
  }
  return plans;
}

/**
 * Counts a plan list by combat class for the Omen panel.
 * @param plans - Bodies that will spawn
 * @returns Class counts, omitting zeros
 */
export function compositionFromPlans(
  plans: readonly SpawnPlan[],
): Partial<Record<ClassId, number>> {
  const composition: Partial<Record<ClassId, number>> = {};
  for (const plan of plans) {
    composition[plan.classId] = (composition[plan.classId] ?? 0) + 1;
  }
  return composition;
}

/**
 * Omen composition for one catalog wave.
 * @param layerId - Layer that owns the wave
 * @param waveId - Wave id
 * @returns Class counts the tower would show
 */
export function omenComposition(
  layerId: WaveSchedule["id"],
  waveId: string,
): Partial<Record<ClassId, number>> {
  const schedule = getSchedule(layerId);
  const wave = schedule.waves.find((entry) => entry.id === waveId);
  if (!wave) throw new Error(`Unknown wave: ${waveId}`);
  return compositionFromPlans(plansForWave(schedule, wave));
}

/**
 * Creates a horde body from a plan and the current clock. Hit points and
 * damage include wave power and the layer's depth scale; the position is
 * always clamped inside `context.bounds`.
 * @param context - Layer grade, essence, pressure, and map bounds
 * @param plan - Body to create
 * @param index - Slot index, ignored when `position` is set
 * @param position - Explicit position for fodder and vent imps
 * @returns A living wave unit
 */
export function spawnUnit(
  context: WaveSpawnContext,
  plan: SpawnPlan,
  index: number,
  position?: { x: number; y: number },
): WaveUnit {
  const definition = getUnitDefinition(plan.classId);
  const placed = clampToMap(
    position ?? slotPosition(index, context.bounds),
    context.bounds,
  );
  const power =
    wavePowerMultiplier(context.collectedEssence, context.grade) *
    hordeStatScale(context.grade);
  const faction = factionFor(context.layerId);
  const scale = plan.useBossStats ? 1 : plan.statScale;
  const baseMaxHitPoints = plan.useBossStats
    ? plan.maxHitPoints * power
    : definition.maxHitPoints * scale * power;
  const baseDamage = plan.useBossStats
    ? plan.damage * power
    : definition.damage * scale * power;
  const baseSpeed = plan.useBossStats ? plan.speed : definition.speed;
  const unit: WaveUnit = {
    affix: plan.affix,
    allyDeathHealFraction: plan.allyDeathHealFraction,
    aoeRadius: plan.aoeRadius,
    armor: plan.useBossStats ? plan.armor : definition.armor,
    barkKey: hordeBarkKey(faction, plan.classId),
    baseDamage,
    baseMaxHitPoints,
    baseSpeed,
    bossId: plan.bossId,
    classId: plan.classId,
    damage: baseDamage,
    definitionId: definition.id,
    factionId: faction,
    hitPoints: baseMaxHitPoints,
    id: `${context.waveId}:${plan.role}:${plan.classId}:${index}`,
    lifesteal: plan.lifesteal,
    maxHitPoints: baseMaxHitPoints,
    preferredTarget: plan.preferredTarget,
    role: plan.role,
    school: plan.school,
    speed: baseSpeed,
    speedMultiplier: 1,
    vision: plan.useBossStats ? plan.vision : definition.vision,
    waveId: context.waveId,
    x: placed.x,
    y: placed.y,
  };
  applyPressure(unit, context.hellPressure);
  unit.speed = unitSpeed(
    unit.baseSpeed,
    unit.speedMultiplier,
    unit.affix,
    context.fallenAllies,
    1,
  );
  return unit;
}

/**
 * Builds a fodder or vent-imp plan of the given class.
 * @param classId - Combat class to copy
 * @param role - `fodder` or `vent_imp`
 * @param scale - Hit point and damage scale
 * @param schedule - Layer, for lifesteal flags
 * @returns A plan with class stats
 */
export function minorPlan(
  classId: CombatClassId,
  role: "fodder" | "vent_imp",
  scale: number,
  schedule: WaveSchedule,
): SpawnPlan {
  return classPlan(classId, role, scale, schedule);
}

/** Hit-point scale used for Summoner fodder. */
export const FODDER_SCALE = FODDER_STAT_SCALE;

/** Hit-point scale used for vent imps. */
export const VENT_IMP_SCALE = VENT_IMP_STAT_SCALE;

/**
 * Role for a composition body. Elites and bosses are added separately.
 * @param type - Wave type
 * @returns Scout, swarm, or escort
 */
function bodyRole(type: WaveType): WaveRole {
  if (type === "scout") return "scout";
  if (type === "swarm") return "swarm";
  return "escort";
}

/**
 * Marks a portion of a swarm as siege. Existing breakers are preferred.
 * Remaining marks convert other swarm bodies into breakers.
 * @param plans - Wave plans, mutated in place
 * @param portion - Share of the wave that should attack walls
 * @param lifestealClasses - Classes that drain on this layer
 */
function applySiegeFirst(
  plans: SpawnPlan[],
  portion: number,
  lifestealClasses: readonly CombatClassId[],
): void {
  if (portion <= 0 || plans.length === 0) return;
  const needed = Math.ceil(plans.length * portion);
  let marked = 0;
  for (const plan of plans) {
    if (marked >= needed) return;
    if (plan.role !== "swarm" || plan.classId !== "breaker") continue;
    plan.preferredTarget = "wall";
    marked += 1;
  }
  for (let index = plans.length - 1; index >= 0; index -= 1) {
    if (marked >= needed) return;
    const plan = plans[index];
    if (plan?.role !== "swarm" || plan?.preferredTarget === "wall") {
      continue;
    }
    plan.classId = "breaker";
    plan.preferredTarget = "wall";
    plan.lifesteal = lifestealClasses.includes("breaker");
    plan.school = plan.lifesteal ? "blood" : null;
    marked += 1;
  }
}

/**
 * Builds a class body plan.
 * @param classId - Combat class
 * @param role - Wave role
 * @param statScale - Hit point and damage scale
 * @param schedule - Layer, for the lifesteal list
 * @param extras - Affix and other overrides
 * @returns The plan
 */
function classPlan(
  classId: CombatClassId,
  role: WaveRole,
  statScale: number,
  schedule: WaveSchedule,
  extras: Partial<SpawnPlan> = {},
): SpawnPlan {
  const lifesteal = schedule.lifestealClasses.includes(classId);
  return {
    affix: null,
    allyDeathHealFraction: 0,
    aoeRadius: null,
    armor: 0,
    bossId: null,
    classId,
    damage: 0,
    lifesteal,
    maxHitPoints: 0,
    preferredTarget: "unit",
    role,
    school: lifesteal ? "blood" : null,
    speed: 0,
    statScale,
    useBossStats: false,
    vision: 0,
    ...extras,
  };
}

/**
 * Builds the boss body plan from the boss catalog.
 * @param bossId - Boss to place
 * @returns A boss plan
 */
function bossPlan(bossId: NonNullable<WaveDefinition["bossId"]>): SpawnPlan {
  const boss = getBossDefinition(bossId);
  return {
    affix: null,
    allyDeathHealFraction: boss.allyDeathHealFraction,
    aoeRadius: boss.aoeRadius,
    armor: boss.armor,
    bossId: boss.id,
    classId: boss.classId,
    damage: boss.damage,
    lifesteal: boss.lifesteal,
    maxHitPoints: boss.maxHitPoints,
    preferredTarget: "unit",
    role: "boss",
    school: boss.school,
    speed: boss.speed,
    statScale: 1,
    useBossStats: true,
    vision: boss.vision,
  };
}

/**
 * Faction label for a layer, taken from the layer table.
 * @param layerId - Active layer
 * @returns Canon faction string
 */
function factionFor(layerId: WaveSpawnContext["layerId"]): string {
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === layerId);
  if (!layer) throw new Error(`Unknown layer: ${layerId}`);
  return layer.faction;
}

/**
 * Clamps one axis inside the edge margin.
 * @param value - Desired coordinate
 * @param size - Map size on this axis
 * @returns Coordinate in `[1, size - 2]`, or the middle on a tiny map
 */
function clampAxis(value: number, size: number): number {
  const low = SPAWN_EDGE_MARGIN;
  const high = size - 1 - SPAWN_EDGE_MARGIN;
  if (high < low) return size / 2;
  return Math.min(high, Math.max(low, value));
}

/**
 * Row offset that keeps the block centred: 0, +1, -1, +2, -2, ...
 * @param row - Zero-based row
 * @returns Offset in rows from the vertical centre
 */
function centredRowOffset(row: number): number {
  const distance = Math.ceil(row / 2);
  if (distance === 0 || row % 2 === 1) return distance;
  return -distance;
}
