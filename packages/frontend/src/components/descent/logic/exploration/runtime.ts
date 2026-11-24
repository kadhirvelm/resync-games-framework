import type { AshenGateMap } from "../../data/layers/ashen_gate/map";
import type {
  ExplorationCampReadout,
  ExplorationReadout,
} from "../../views/presentation";
import { getUnitDefinition } from "../combat/unitCatalog";
import { addItem } from "../economy/queries";
import {
  createUnitRecord,
  economyHost,
  isEconomyUnit,
} from "../economy/records";
import { resourceDef } from "../economy/tables";
import { cellOpen, isExplorationCarrier } from "../economy/villagers";
import { isFogExplored } from "../fog";
import { worldVentVolumes } from "../layers/hazards";
import { createMapRng, floodDistances, stepsTo } from "../mapgen";
import type { TickContext } from "../sim/modules";
import type { SimWorldState } from "../sim/world";
import { assignUniqueCultivatorName } from "../slice/cultivatorNames";
import { openCultivation, saveCultivation } from "../slice/sliceCultivation";
import { isCultivatorClass } from "../slice/sliceCultivatorPowers";
import { readFogOfWar } from "../slice/sliceFog";
import {
  ECONOMY_STEP_TICKS,
  pushFx,
  pushNotice,
  sliceState,
  waveState,
} from "../slice/sliceState";
import { RESOURCE_IDS } from "../types";
import { getBossDefinition } from "../waves/catalog";
import { spawnUnit } from "../waves/spawn";
import type { SpawnPlan, WaveUnit } from "../waves/types";
import {
  EXPLORATION_CAMP_BLUEPRINTS,
  EXPLORATION_STATE_VERSION,
  type ExplorationCampBlueprint,
  type ExplorationCampState,
  type ExplorationGuard,
  type ExplorationRescuedUnit,
  type ExplorationReward,
  type ExplorationState,
  explorationGuardComposition,
  formatExplorationReward,
} from "./model";

/** Module id used by camp-clear events for presentation and audio hooks. */
export const EXPLORATION_MODULE_ID = "exploration";

/** Minimum distance between camp centers so their aggro zones stay distinct. */
const CAMP_SPACING = 22;

/** Stable offsets used to arrange each camp's defenders around its prize. */
const GUARD_OFFSETS: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: -2, y: 0 },
  { x: 0, y: 2 },
  { x: 0, y: -2 },
  { x: 3, y: 2 },
  { x: -3, y: -2 },
  { x: -2, y: 3 },
  { x: 2, y: -3 },
];

/** A generated collision mask and walk field shared by one camp placement pass. */
interface CampPlacementGrid {
  field: ReturnType<typeof floodDistances>;
  open: (x: number, y: number) => boolean;
}

/**
 * Creates the fixed-strength camp roster and adds its guards to the existing
 * wave clock. Reusing `WaveUnit` keeps combat, cultivation, saves, and boss
 * phases identical between siege and exploration; only scheduling and AI
 * destinations differ.
 * @param world - Fresh Ashen Gate world with economy and terrain already seeded
 * @param layout - Generated map used for reachability and collision checks
 * @returns Saved exploration state for the slice
 */
export function initializeExploration(
  world: SimWorldState,
  layout: AshenGateMap,
): ExplorationState {
  const grid = createPlacementGrid(world, layout);
  const origin = layout.buildings.find(
    (building) => building.buildingType === "camp",
  );
  if (origin === undefined)
    throw new Error("Exploration needs a starting Camp");
  const rng = createMapRng(world.seed, "ashen_gate:exploration-camps");
  const camps: ExplorationCampState[] = [];
  for (const blueprint of EXPLORATION_CAMP_BLUEPRINTS) {
    const point = chooseCampPoint(
      world,
      grid,
      origin,
      blueprint,
      camps,
      rng.next,
    );
    camps.push({
      bonusCollected: false,
      cacheSpawned: false,
      cleared: false,
      discovered: blueprint.rumored === true,
      guards: blueprint.guards.map((guard) => ({ ...guard })),
      id: blueprint.id,
      name: blueprint.name,
      reward: cloneReward(blueprint.reward),
      rewardCollected: false,
      threat: blueprint.threat,
      waveId: blueprint.waveId,
      x: point.x,
      y: point.y,
    });
  }

  const waves = waveState(world);
  const guards = camps.flatMap((camp) => spawnCampGuards(world, grid, camp));
  waves.units.push(...guards);
  waves.trackedUnitIds.push(...guards.map((guard) => guard.id));
  world.units.push(
    ...guards.map((guard) => ({
      classId: guard.classId,
      id: guard.id,
      x: guard.x,
      y: guard.y,
    })),
  );
  return { camps, version: EXPLORATION_STATE_VERSION };
}

/**
 * Migrates pre-haul saves and fills new optional cache fields without repaying
 * rewards granted by the older immediate-payout rules.
 * @param world - Loaded sim world with optional exploration state
 */
export function normalizeExplorationState(world: SimWorldState): void {
  const exploration = sliceState(world).exploration;
  if (exploration === undefined) return;
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  for (const camp of exploration.camps) {
    camp.rewardCollected ??= camp.cleared;
    camp.bonusCollected ??= camp.rewardCollected;
    camp.cacheSpawned ??= camp.cleared && !camp.rewardCollected;
    const hasLegacyClaim = host.economy.explorationClaims.some(
      (claim) => claim.campId === camp.id && claim.nodeId === undefined,
    );
    if (hasLegacyClaim) {
      camp.cacheSpawned = true;
      continue;
    }
    const legacyNodes = host.economy.nodes.filter(
      (node) =>
        node.explorationCacheId === camp.id &&
        node.label === `${camp.name} Cache`,
    );
    if (legacyNodes.length === 0 || camp.rewardCollected) continue;
    const legacyIds = new Set(legacyNodes.map((node) => node.id));
    host.economy.nodes = host.economy.nodes.filter(
      (node) => !legacyIds.has(node.id),
    );
    for (const unit of host.units) {
      if (!isEconomyUnit(unit)) continue;
      if (unit.carry?.explorationCacheId !== camp.id) continue;
      unit.carry = null;
      unit.preferredNodeId = null;
      unit.task = null;
    }
    camp.cacheSpawned = false;
  }
}

/**
 * Marks camps discovered by the current fog grid and announces their exact
 * threat and prize. The opening rumored camp starts discovered and stays quiet.
 * @param world - Live exploration world
 */
export function discoverExplorationCamps(world: SimWorldState): void {
  const exploration = sliceState(world).exploration;
  if (exploration === undefined) return;
  const fog = readFogOfWar(world);
  for (const camp of exploration.camps) {
    if (camp.discovered || !isFogExplored(fog, camp)) continue;
    camp.discovered = true;
    pushNotice(
      world,
      `Camp found: ${camp.name} · Threat ${roman(camp.threat)} · ${formatExplorationReward(camp.reward)}`,
      "info",
    );
  }
}

/**
 * Cancels a Qi cultivator's cache haul when the player issues a military order.
 * The cache remains available for a later villager or cultivator to collect.
 * @param world - Live exploration world
 * @param unitIds - Units receiving the new order
 */
export function cancelExplorationHaul(
  world: SimWorldState,
  unitIds: readonly string[],
): void {
  const selected = new Set(unitIds);
  for (const unit of world.units) {
    if (!selected.has(unit.id) || !isEconomyUnit(unit)) continue;
    if (!isExplorationCarrier(unit)) continue;
    unit.preferredNodeId = null;
    unit.task = null;
  }
}

/**
 * Spawns haulable caches after combat and settles only deliveries to storage.
 * No timer, Essence harvest, or Pressure can respawn or strengthen a camp.
 * @param context - Current deterministic sim tick
 */
export function advanceExploration(context: TickContext): void {
  const { world } = context;
  const exploration = sliceState(world).exploration;
  if (exploration === undefined) return;
  const waves = waveState(world);
  for (const camp of exploration.camps) {
    if (camp.rewardCollected) continue;
    if (!camp.cleared) {
      const guardsRemain = waves.units.some(
        (unit) => unit.guardCampId === camp.id || unit.waveId === camp.waveId,
      );
      if (guardsRemain) continue;
      camp.cleared = true;
      camp.discovered = true;
      spawnExplorationCache(context, camp);
      continue;
    }
    if (!camp.cacheSpawned) spawnExplorationCache(context, camp);
  }
  settleExplorationClaims(context);
}

/**
 * Places one deterministic, distinct cache node per positive resource reward.
 * Each node is hauled as one special load; ordinary carry capacities do not
 * split it into repetitive trips.
 * @param context - Current tick
 * @param camp - Cleared camp whose guards are gone
 */
function spawnExplorationCache(
  context: TickContext,
  camp: ExplorationCampState,
): void {
  const { world } = context;
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  camp.cacheSpawned = true;
  let cacheIndex = 0;
  for (const resourceId of RESOURCE_IDS) {
    const amount = camp.reward.resources?.[resourceId] ?? 0;
    if (amount <= 0) continue;
    const suffix = cacheIndex === 0 ? "" : `:${resourceId}`;
    const id = `exploration-cache:${camp.id}${suffix}`;
    cacheIndex += 1;
    if (host.economy.nodes.some((node) => node.id === id)) continue;
    const cell = rescueCell(world, camp, "", cacheIndex - 1);
    host.economy.nodes.push({
      explorationCacheId: camp.id,
      id,
      label: `${camp.name} · ${resourceDef(resourceId)?.name ?? resourceId} Cache`,
      nodeType: "exploration_cache",
      remaining: amount,
      resourceId,
      x: cell.x,
      y: cell.y,
    });
  }
  pushNotice(
    world,
    `${camp.name} guards cleared. Send a villager or Qi cultivator to haul each resource cache home: ${formatExplorationReward(camp.reward)}`,
    "good",
  );
  if (camp.guards.some((guard) => guard.bossId !== undefined)) {
    pushNotice(
      world,
      "Cinderjaw is defeated. Bring every hoard cache to storage before finishing the expedition.",
      "warn",
    );
  }
  context.emit(EXPLORATION_MODULE_ID, "camp_cleared", {
    awaitingHaul: true,
    campId: camp.id,
    reward: camp.reward,
    threat: camp.threat,
  });
}

/**
 * Settles non-resource prizes after the economy has credited each delivered
 * cache. Resource stock is never granted here, so replaying a claim cannot
 * duplicate it. Legacy bundle claims retain their original one-shot payout.
 * @param context - Current deterministic sim tick
 */
function settleExplorationClaims(context: TickContext): void {
  const { world } = context;
  const exploration = sliceState(world).exploration;
  if (exploration === undefined) return;
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const claims = host.economy.explorationClaims.splice(0);
  for (const claim of claims) {
    const camp = exploration.camps.find((entry) => entry.id === claim.campId);
    if (camp === undefined || camp.rewardCollected) continue;
    const legacyBundleClaim =
      claim.nodeId === undefined &&
      claim.resourceId === undefined &&
      claim.amount === undefined;
    if (legacyBundleClaim) {
      host.economy.nodes = host.economy.nodes.filter(
        (node) => node.explorationCacheId !== camp.id,
      );
      grantExplorationReward(context, camp, claim.dropOffId);
      camp.bonusCollected = true;
      camp.rewardCollected = true;
      announceExplorationCampComplete(context, camp);
      context.emit(EXPLORATION_MODULE_ID, "cache_collected", {
        campId: camp.id,
        dropOffId: claim.dropOffId,
        reward: camp.reward,
      });
      continue;
    }
    if (
      claim.nodeId === undefined ||
      claim.resourceId === undefined ||
      claim.amount === undefined ||
      claim.amount <= 0
    ) {
      continue;
    }
    if (!camp.bonusCollected) {
      grantExplorationReward(context, camp, claim.dropOffId, false);
      camp.bonusCollected = true;
    }
    pushNotice(
      world,
      `${camp.name}: +${claim.amount} ${resourceDef(claim.resourceId)?.name ?? claim.resourceId} delivered.`,
      "good",
    );
    context.emit(EXPLORATION_MODULE_ID, "cache_collected", {
      amount: claim.amount,
      campId: camp.id,
      dropOffId: claim.dropOffId,
      nodeId: claim.nodeId,
      resourceId: claim.resourceId,
      reward: camp.reward,
    });
  }
  for (const camp of exploration.camps) {
    if (camp.rewardCollected || !camp.cleared || !camp.bonusCollected) continue;
    if (
      host.economy.nodes.some((node) => node.explorationCacheId === camp.id)
    ) {
      continue;
    }
    const loadInFlight = host.units.some(
      (unit) =>
        isEconomyUnit(unit) && unit.carry?.explorationCacheId === camp.id,
    );
    if (loadInFlight) continue;
    camp.rewardCollected = true;
    announceExplorationCampComplete(context, camp);
  }
}

/** Announces full camp completion after its final resource cache arrives. */
function announceExplorationCampComplete(
  context: TickContext,
  camp: ExplorationCampState,
): void {
  pushNotice(
    context.world,
    `${camp.name} prize secured! ${formatExplorationReward(camp.reward)}`,
    "good",
  );
  if (!camp.guards.some((guard) => guard.bossId !== undefined)) return;
  pushNotice(
    context.world,
    "Cinderjaw's hoard is yours. Use Finish expedition when ready; any remaining camps are optional.",
    "good",
  );
}

/**
 * Reports whether every boss camp's prize is clear to claim. Siege has no
 * exploration gate, so this returns true there.
 * @param world - Sim world with optional exploration state
 * @returns True when Cinderjaw and every body guarding his hoard are gone
 */
export function isExplorationBossCampCleared(world: SimWorldState): boolean {
  const exploration = sliceState(world).exploration;
  if (exploration === undefined) return true;
  return exploration.camps.every(
    (camp) =>
      !camp.guards.some((guard) => guard.bossId !== undefined) ||
      camp.rewardCollected === true,
  );
}

/**
 * Builds the fog-safe camp tracker. Undiscovered names, positions, rosters,
 * and prizes never enter the shell model, while the total remains visible as
 * an exploration goal.
 * @param world - Live exploration world
 * @returns Camp readouts and overall clear count, or null in siege mode
 */
export function explorationPresentation(
  world: SimWorldState,
): ExplorationReadout | null {
  const exploration = sliceState(world).exploration;
  if (exploration === undefined) return null;
  const waves = waveState(world);
  const camps: ExplorationCampReadout[] = [];
  let clearedCamps = 0;
  for (const camp of exploration.camps) {
    if (camp.cleared) clearedCamps += 1;
    if (!camp.discovered || camp.rewardCollected) continue;
    const campUnits = waves.units.filter(
      (unit) => unit.guardCampId === camp.id || unit.waveId === camp.waveId,
    );
    const guardsRemaining = campUnits.filter(
      (unit) => unit.role !== "fodder" && unit.role !== "vent_imp",
    ).length;
    const reinforcements = campUnits.filter(
      (unit) => unit.role === "fodder" || unit.role === "vent_imp",
    ).length;
    camps.push({
      cleared: camp.cleared,
      guardComposition: explorationGuardComposition(camp),
      guardsRemaining,
      guardsTotal: camp.guards.length,
      id: camp.id,
      name: camp.name,
      reinforcements,
      rewardCollected: camp.rewardCollected ?? false,
      rewardLabel: formatExplorationReward(camp.reward),
      threat: camp.threat,
      x: camp.x,
      y: camp.y,
    });
  }
  return {
    bossDefeated: waves.bossGateCleared,
    camps,
    clearedCamps,
    pendingCaches: exploration.camps.filter(
      (camp) => camp.cleared && !camp.rewardCollected,
    ).length,
    totalCamps: exploration.camps.length,
    undiscoveredCamps: exploration.camps.filter((camp) => !camp.discovered)
      .length,
  };
}

/**
 * Grants a camp's pill and rescue components at the receiving storage. The
 * legacy path can also grant its old bundle resources; resource-backed caches
 * are already credited by the economy deposit and must exclude them here.
 * @param context - Current tick, used for deterministic unit ids and events
 * @param camp - Camp being settled
 * @param dropOffId - Storage building that received the cache
 * @param includeLegacyResources - Whether to pay the pre-resource-cache bundle
 */
function grantExplorationReward(
  context: TickContext,
  camp: ExplorationCampState,
  dropOffId: string,
  includeLegacyResources = true,
): void {
  const { world } = context;
  if (includeLegacyResources) {
    for (const [resource, amount] of Object.entries(
      camp.reward.resources ?? {},
    )) {
      if (amount === undefined || amount <= 0) continue;
      world.resources[resource as keyof typeof world.resources] += amount;
    }
  }
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  for (const [pillId, count] of Object.entries(camp.reward.pills ?? {})) {
    addItem(host, pillId, count);
  }
  const groups = camp.reward.units ?? [];
  if (groups.length === 0) return;
  const cultivation = openCultivation(world);
  let rescueIndex = 0;
  for (const group of groups) {
    for (let index = 0; index < group.count; index += 1) {
      const cell = rescueCell(world, camp, dropOffId, rescueIndex);
      rescueIndex += 1;
      rescueUnit(context, cultivation, group, cell);
    }
  }
  saveCultivation(world, cultivation);
}

/**
 * Places one rescued unit and registers its combat/cultivation records.
 * @param context - Current tick
 * @param cultivation - Open cultivation system covering the world
 * @param group - Rescue group being spawned
 * @param cell - Open map cell beside the camp
 */
function rescueUnit(
  context: TickContext,
  cultivation: ReturnType<typeof openCultivation>,
  group: ExplorationRescuedUnit,
  cell: { x: number; y: number },
): void {
  const { world } = context;
  const id = context.nextEntityId(`rescued-${group.classId}`);
  if (group.classId === "villager") {
    world.units.push(createUnitRecord({ id, x: cell.x, y: cell.y }));
    pushFx(world, { kind: "spawn", sound: "villager", x: cell.x, y: cell.y });
    return;
  }
  const definition = getUnitDefinition(group.classId);
  const customName = isCultivatorClass(group.classId)
    ? assignUniqueCultivatorName(world, id)
    : undefined;
  world.units.push(
    createUnitRecord({
      classId: group.classId,
      hp: definition.maxHitPoints,
      id,
      maxHp: definition.maxHitPoints,
      ...(customName === undefined ? {} : { name: customName }),
      popKind: "soldier",
      realmId: realmForRank(group.rank ?? "Ashborn"),
      x: cell.x,
      y: cell.y,
    }),
  );
  cultivation.registerUnit({
    maxHealth: definition.maxHitPoints,
    rank: group.rank ?? "Ashborn",
    unitId: id,
  });
  pushFx(world, { kind: "spawn", sound: "soldier", x: cell.x, y: cell.y });
}

/**
 * Converts a rank title to the economy's population/realm id without making
 * rescue rewards depend on the slice's private rank table.
 * @param rank - Rescue cultivation rank
 * @returns Economy realm id
 */
function realmForRank(rank: NonNullable<ExplorationRescuedUnit["rank"]>) {
  if (rank === "Sworn") return "foundation" as const;
  if (rank === "Veteran") return "core_formation" as const;
  if (rank === "Champion") return "nascent_soul" as const;
  if (rank === "Ascended") return "ascension" as const;
  return "qi_gathering" as const;
}

/**
 * Creates all bodies for one camp around its guarded prize.
 * @param world - Live world whose bounds and layer grade are read
 * @param grid - Static walkability used to avoid blocked guard cells
 * @param camp - Positioned camp definition
 * @returns Fixed-strength wave units with home-leash metadata
 */
function spawnCampGuards(
  world: SimWorldState,
  grid: CampPlacementGrid,
  camp: ExplorationCampState,
): WaveUnit[] {
  const occupied = new Set<string>();
  return camp.guards.map((guard, index) => {
    const offset = GUARD_OFFSETS[index] ?? { x: index * 2, y: 0 };
    // Keep Cinderjaw beside, rather than inside, the visible hoard marker.
    const desired =
      guard.bossId === undefined
        ? { x: camp.x + offset.x, y: camp.y + offset.y }
        : { x: camp.x, y: camp.y - 2 };
    const cell = nearestOpenCell(grid, desired, occupied, 7) ?? camp;
    occupied.add(cellKey(cell));
    const unit = spawnUnit(
      {
        bounds: world.map,
        collectedEssence: 0,
        fallenAllies: 0,
        grade: 1,
        hellPressure: 0,
        layerId: "ashen_gate",
        statMultiplier: 1,
        waveId: camp.waveId,
      },
      guardPlan(guard),
      index,
      cell,
    );
    unit.guardCampId = camp.id;
    unit.guardHome = { x: cell.x, y: cell.y };
    return unit;
  });
}

/**
 * Converts a camp guard into the ordinary wave spawner's plan shape.
 * @param guard - Fixed class, scale, role, and optional boss id
 * @returns A spawn plan with no hidden scaling inputs
 */
function guardPlan(guard: ExplorationGuard): SpawnPlan {
  const boss =
    guard.bossId === undefined ? null : getBossDefinition(guard.bossId);
  return {
    affix: null,
    allyDeathHealFraction: boss?.allyDeathHealFraction ?? 0,
    aoeRadius: boss?.aoeRadius ?? null,
    armor: boss?.armor ?? 0,
    bossId: boss?.id ?? null,
    classId: boss?.classId ?? guard.classId,
    damage: boss?.damage ?? 0,
    lifesteal: boss?.lifesteal ?? false,
    maxHitPoints: boss?.maxHitPoints ?? 0,
    preferredTarget: "unit",
    role: guard.role,
    school: boss?.school ?? null,
    speed: boss?.speed ?? 0,
    statScale: guard.statScale,
    useBossStats: boss !== null,
    vision: boss?.vision ?? 0,
  };
}

/**
 * Builds a static collision mask and flood field for camp placement.
 * @param world - World bounds
 * @param layout - Generated deposits, structures, vents, and obstacles
 * @returns Passability query and steps from the starting Camp
 */
function createPlacementGrid(
  world: SimWorldState,
  layout: AshenGateMap,
): CampPlacementGrid {
  const { height, width } = world.map;
  const blocked = new Uint8Array(width * height);
  for (const building of layout.buildings) {
    // The flood starts at the Camp's center. Mark only that occupied cell so
    // it can step onto the surrounding apron instead of sealing itself in.
    markCell(blocked, width, height, building.x, building.y);
  }
  for (const node of layout.nodes) {
    markCell(blocked, width, height, node.x, node.y);
  }
  for (const vein of layout.veins) {
    markCell(blocked, width, height, vein.x, vein.y);
  }
  for (const circle of [...layout.obstacles, ...layout.vents]) {
    markCircle(blocked, width, height, circle);
  }
  const origin = layout.buildings.find(
    (building) => building.buildingType === "camp",
  );
  const field = floodDistances(
    { height, width },
    origin ?? { x: 0, y: 0 },
    (x, y) => blocked[y * width + x] === 0,
  );
  return {
    field,
    open: (x, y) =>
      x >= 1 &&
      y >= 1 &&
      x < width - 1 &&
      y < height - 1 &&
      blocked[y * width + x] === 0,
  };
}

/**
 * Selects the nearest reachable open point to a blueprint's desired region.
 * @param world - Map bounds
 * @param grid - Static collision and path data
 * @param origin - Starting Camp
 * @param blueprint - Camp being positioned
 * @param placed - Earlier camps, kept outside one another's aggro range
 * @param random - Derived map-only RNG cursor
 * @returns A reachable camp center
 */
function chooseCampPoint(
  world: SimWorldState,
  grid: CampPlacementGrid,
  origin: { x: number; y: number },
  blueprint: ExplorationCampBlueprint,
  placed: readonly ExplorationCampState[],
  random: () => number,
): { x: number; y: number } {
  const base = blueprint.target.fromCamp;
  const target = {
    x:
      base === undefined
        ? (blueprint.target.x ?? 0.5) * world.map.width
        : origin.x + base.x,
    y:
      base === undefined
        ? (blueprint.target.y ?? 0.5) * world.map.height
        : origin.y + base.y,
  };
  target.x += random() * 6 - 3;
  target.y += random() * 6 - 3;
  target.x = Math.round(Math.max(4, Math.min(world.map.width - 5, target.x)));
  target.y = Math.round(Math.max(4, Math.min(world.map.height - 5, target.y)));

  for (let relax = 0; relax < 2; relax += 1) {
    let best: { x: number; y: number } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const radius =
      relax === 0 ? 20 : Math.max(world.map.width, world.map.height);
    for (let y = target.y - radius; y <= target.y + radius; y += 1) {
      for (let x = target.x - radius; x <= target.x + radius; x += 1) {
        if (!grid.open(x, y) || stepsTo(grid.field, { x, y }) < 0) continue;
        if (Math.hypot(x - origin.x, y - origin.y) < 12) continue;
        const spacing = relax === 0 ? CAMP_SPACING : 8;
        if (
          placed.some((camp) => Math.hypot(x - camp.x, y - camp.y) < spacing)
        ) {
          continue;
        }
        if (nearbyOpenCount(grid, { x, y }, 5) < blueprint.guards.length + 2) {
          continue;
        }
        const score = Math.hypot(x - target.x, y - target.y);
        if (score >= bestScore) continue;
        best = { x, y };
        bestScore = score;
      }
    }
    if (best !== null) return best;
  }
  throw new Error(`No reachable ground for exploration camp ${blueprint.id}`);
}

/**
 * Finds a unique open guard cell near a desired formation offset.
 * @param grid - Static placement data
 * @param desired - Preferred guard position
 * @param occupied - Positions already assigned in this camp
 * @param radius - Search radius in cells
 * @returns Nearest reachable open cell, or null in a packed fallback camp
 */
function nearestOpenCell(
  grid: CampPlacementGrid,
  desired: { x: number; y: number },
  occupied: ReadonlySet<string>,
  radius: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = desired.y - radius; y <= desired.y + radius; y += 1) {
    for (let x = desired.x - radius; x <= desired.x + radius; x += 1) {
      const key = cellKey({ x, y });
      if (occupied.has(key) || !grid.open(x, y)) continue;
      if (stepsTo(grid.field, { x, y }) < 0) continue;
      const distance = Math.hypot(x - desired.x, y - desired.y);
      if (distance >= bestDistance) continue;
      best = { x, y };
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Finds a free cell for a rescued ally after guards have been removed.
 * @param world - Current world with buildings, nodes, and units
 * @param camp - Cleared camp, used as a fallback position
 * @param dropOffId - Storage building that received the cache
 * @param index - Rescue index, used to fan allies around storage
 * @returns Open cell near the receiving storage
 */
function rescueCell(
  world: SimWorldState,
  camp: ExplorationCampState,
  dropOffId: string,
  index: number,
): { x: number; y: number } {
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const vents = worldVentVolumes(world);
  const offset = GUARD_OFFSETS[index % GUARD_OFFSETS.length] ?? { x: 0, y: 0 };
  const storage = world.buildings.find((building) => building.id === dropOffId);
  const anchor = storage ?? camp;
  const desired = { x: anchor.x + offset.x, y: anchor.y + offset.y };
  let best: { x: number; y: number } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const maxRadius = Math.max(world.map.width, world.map.height);
  for (const radius of [7, 24, maxRadius]) {
    const minX = Math.max(0, anchor.x - radius);
    const maxX = Math.min(world.map.width - 1, anchor.x + radius);
    const minY = Math.max(0, anchor.y - radius);
    const maxY = Math.min(world.map.height - 1, anchor.y + radius);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!cellOpen(host, x, y, "ally")) continue;
        if (host.economy.nodes.some((node) => node.x === x && node.y === y)) {
          continue;
        }
        if (
          vents.some(
            (vent) => Math.hypot(x - vent.x, y - vent.y) <= vent.radius,
          )
        ) {
          continue;
        }
        if (
          world.units.some(
            (unit) =>
              (!isEconomyUnit(unit) || unit.hp > 0) &&
              Math.hypot(unit.x - x, unit.y - y) < 0.8,
          )
        ) {
          continue;
        }
        const score = Math.hypot(x - desired.x, y - desired.y);
        if (score >= bestScore) continue;
        best = { x, y };
        bestScore = score;
      }
    }
    if (best !== null) return best;
  }
  throw new Error(`No open cell available for rescued unit at ${dropOffId}`);
}

/**
 * Counts open cells around a proposed camp to fit its formation.
 * @param grid - Static placement data
 * @param center - Proposed camp center
 * @param radius - Square search radius
 * @returns Number of reachable open cells
 */
function nearbyOpenCount(
  grid: CampPlacementGrid,
  center: { x: number; y: number },
  radius: number,
): number {
  let count = 0;
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (!grid.open(x, y) || stepsTo(grid.field, { x, y }) < 0) continue;
      count += 1;
    }
  }
  return count;
}

/**
 * Marks one blocked cell when it lies inside the map.
 * @param blocked - Flat collision mask
 * @param width - Map width
 * @param height - Map height
 * @param x - Cell column
 * @param y - Cell row
 */
function markCell(
  blocked: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  blocked[y * width + x] = 1;
}

/**
 * Marks all cells covered by a circular obstacle or hazard.
 * @param blocked - Flat collision mask
 * @param width - Map width
 * @param height - Map height
 * @param circle - Circle to mark
 */
function markCircle(
  blocked: Uint8Array,
  width: number,
  height: number,
  circle: { radius: number; x: number; y: number },
): void {
  const reach = Math.ceil(circle.radius);
  for (let y = circle.y - reach; y <= circle.y + reach; y += 1) {
    for (let x = circle.x - reach; x <= circle.x + reach; x += 1) {
      if (Math.hypot(x - circle.x, y - circle.y) > circle.radius) continue;
      markCell(blocked, width, height, x, y);
    }
  }
}

/**
 * Deep-copies scenario reward data before it enters mutable sim state.
 * @param reward - Blueprint reward
 * @returns JSON-safe reward owned by one run
 */
function cloneReward(reward: ExplorationReward): ExplorationReward {
  return {
    pills: reward.pills === undefined ? undefined : { ...reward.pills },
    resources:
      reward.resources === undefined ? undefined : { ...reward.resources },
    units: reward.units?.map((group) => ({ ...group })),
  };
}

/**
 * Formats small threat numbers without introducing another display dependency.
 * @param value - 1-based camp threat
 * @returns Roman numeral label
 */
function roman(value: number): string {
  return ["I", "II", "III", "IV", "V", "VI"][value - 1] ?? String(value);
}

/**
 * Stable key for one integer map cell.
 * @param point - Cell to key
 * @returns Coordinate key
 */
function cellKey(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}
