import { asBuilding, isEconomyUnit } from "./economy/records";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  type AshenGateSliceState,
  isAshenGateSliceState,
} from "./slice/sliceState";
import type { SimSnapshot } from "./types";
import { isWaveClockState } from "./waves/clock";

/** Stable identifiers for each Descent tutorial step, in teaching order. */
export type TutorialStepId =
  | "gather"
  | "build_barracks"
  | "train_soldiers"
  | "defend_wave"
  | "build_tower"
  | "cultivate"
  | "defeat_boss";

/** UI target hint used to focus or highlight the relevant game entity or menu. */
export type TutorialTargetHint =
  | "idle_villagers"
  | "build_barracks"
  | "barracks"
  | "soldiers"
  | "camp"
  | "cultivator"
  | "boss";

/** Static teaching copy for one tutorial step. */
export interface TutorialStepDefinition {
  /** Single-line actionable instruction. */
  detail: string;
  /** Keycap badges highlighted beside the instructions. */
  hotkeys: readonly string[];
  id: TutorialStepId;
  /** Target hint for focusing the relevant unit, building, or menu. */
  targetHint: TutorialTargetHint;
  /** Short strategy tip relevant to both solo and co-op play. */
  tip: string;
  /** Short objective title shown in the checklist. */
  title: string;
}

/** Evaluated live state of one tutorial step. */
export interface TutorialStepProgress extends TutorialStepDefinition {
  completed: boolean;
  /** Zero-based step position. */
  index: number;
  /** Live counter readout such as `1 / 2 villagers working`. */
  progressLabel: string;
}

/** Complete evaluated progress of the tutorial for one snapshot. */
export interface TutorialProgress {
  /** First incomplete step, or `null` once every step is complete. */
  activeStep: TutorialStepProgress | null;
  allComplete: boolean;
  completedCount: number;
  steps: readonly TutorialStepProgress[];
  totalCount: number;
}

/** Ordered curriculum for the Descent first-run solo and co-op tutorial. */
export const DESCENT_TUTORIAL_STEPS: readonly TutorialStepDefinition[] = [
  {
    detail:
      "Select your Villagers and right-click a nearby Tree, Rock Vein, Grove, or Spring.",
    hotkeys: [".", "Right-Click"],
    id: "gather",
    targetHint: "idle_villagers",
    tip: "Split villagers across Wood, Food, and Stone to fund your early Hold.",
    title: "Put Villagers to Work",
  },
  {
    detail:
      "Press B, pick Barracks, and place it on open ground near your Camp.",
    hotkeys: ["B", "Left-Click"],
    id: "build_barracks",
    targetHint: "build_barracks",
    tip: "Placing on a glowing Spirit Vein adds +15% training speed.",
    title: "Build a Barracks",
  },
  {
    detail:
      "Select your Barracks, train 2 Wardens, and right-click ground to set a Rally Point.",
    hotkeys: ["Click Barracks", "Right-Click"],
    id: "train_soldiers",
    targetHint: "barracks",
    tip: "Upgrading your Camp to an Outpost unlocks Hunters and Riders.",
    title: "Train Reinforcements",
  },
  {
    detail:
      "Select your soldiers, press A, and left-click east to Attack-Move into the scout wave.",
    hotkeys: ["A", "Left-Click"],
    id: "defend_wave",
    targetHint: "soldiers",
    tip: "Use Formations so melee Wardens hold the front line.",
    title: "Repel the First Scout Wave",
  },
  {
    detail:
      "Upgrade your Camp to Outpost, then press B to build a Ward Tower guarding the east lane.",
    hotkeys: ["Click Camp", "B"],
    id: "build_tower",
    targetHint: "camp",
    tip: "Fight near Ward Towers for covering fire and pull wounded units behind them.",
    title: "Upgrade to Outpost & Build a Ward Tower",
  },
  {
    detail:
      "Promote a ready soldier to Sworn and choose a school, or build a Cultivation Hall.",
    hotkeys: ["Click Unit", "B"],
    id: "cultivate",
    targetHint: "cultivator",
    tip: "Combat earns Merit and Essence—choose Ember, Rime, or Blood when ascending.",
    title: "Reach a Breakthrough",
  },
  {
    detail:
      "Grow your army, defeat Cinderjaw when it arrives from the east, and click Descend.",
    hotkeys: ["Space", "1×–4×"],
    id: "defeat_boss",
    targetHint: "boss",
    tip: "Press Space anytime to pause and issue orders; dodge glowing Ember Vents.",
    title: "Slay Cinderjaw",
  },
] as const;

/** Number of working villagers required to complete Step 1. */
const REQUIRED_WORKING_VILLAGERS = 2;

/** Additional soldiers beyond starting Captains required for Step 3. */
const REQUIRED_EXTRA_SOLDIERS = 2;

/** Minimal world/snapshot view required to evaluate tutorial progress. */
export type TutorialWorldView = Pick<
  SimSnapshot,
  "buildings" | "meta" | "units"
>;

/**
 * Counts how many completed buildings of a given type exist in the world.
 * @param snapshot - Current sim snapshot or world state
 * @param buildingType - Economy building id
 * @returns Completed building count
 */
function countCompletedBuildings(
  snapshot: TutorialWorldView,
  buildingType: string,
): number {
  let count = 0;
  for (const building of snapshot.buildings) {
    if (building.buildingType !== buildingType) continue;
    if (asBuilding(building).completed) count += 1;
  }
  return count;
}

/**
 * Counts how many living villagers are currently assigned to a task.
 * @param snapshot - Current sim snapshot or world state
 * @returns Active (non-idle) villager count
 */
function countWorkingVillagers(snapshot: TutorialWorldView): number {
  let count = 0;
  for (const unit of snapshot.units) {
    if (!isEconomyUnit(unit)) continue;
    if (unit.popKind !== "villager" || unit.hp <= 0) continue;
    if (unit.task !== null) count += 1;
  }
  return count;
}

/**
 * Counts all living allied combat soldiers (excluding villagers).
 * @param snapshot - Current sim snapshot or world state
 * @returns Living soldier count
 */
function countLivingSoldiers(snapshot: TutorialWorldView): number {
  let count = 0;
  for (const unit of snapshot.units) {
    if (!isEconomyUnit(unit)) continue;
    if (unit.popKind !== "soldier" || unit.hp <= 0) continue;
    count += 1;
  }
  return count;
}

/**
 * Checks whether any Hold unit has ascended past Ashborn or chosen a school.
 * @param slice - Ashen Gate slice state, if initialized
 * @returns True when any cultivated Hold unit reached Sworn+ or picked a school
 */
function hasBreakthroughUnit(slice: AshenGateSliceState | null): boolean {
  const units = slice?.cultivation?.units;
  if (!Array.isArray(units)) return false;
  for (const unit of units) {
    if (unit.rank !== "Ashborn") return true;
    if (unit.school !== undefined) return true;
  }
  return false;
}

/**
 * Reads the current Hold tier from `meta.economy`, defaulting to `"Camp"`.
 * @param snapshot - Current sim snapshot
 * @returns Current Hold tier string
 */
function readHoldTier(snapshot: TutorialWorldView): string {
  const economy = snapshot.meta.economy;
  if (
    typeof economy === "object" &&
    economy !== null &&
    "tier" in economy &&
    typeof (economy as { tier?: unknown }).tier === "string"
  ) {
    return (economy as { tier: string }).tier;
  }
  return "Camp";
}

/**
 * Formats the live progress label for the first scout wave step.
 * @param firstWaveRepelled - Whether wave 0 has been cleared
 * @param spawnedWaves - Number of waves spawned so far
 * @param livingHorde - Number of living horde units
 * @returns Human-readable progress badge text
 */
function formatDefendWaveLabel(
  firstWaveRepelled: boolean,
  spawnedWaves: number,
  livingHorde: number,
): string {
  if (firstWaveRepelled) return "Scout wave cleared";
  if (spawnedWaves === 0) return "Waiting for first scout wave";
  const noun = livingHorde === 1 ? "raider" : "raiders";
  return `${livingHorde} ${noun} remaining`;
}

/**
 * Formats the live progress label for the breakthrough / cultivation step.
 * @param breakthroughReached - Whether a unit has reached Sworn or chosen a school
 * @param hallCount - Completed Cultivation Hall count
 * @param strongholdReached - Whether the Hold has reached Stronghold+
 * @returns Human-readable progress badge text
 */
function formatCultivateLabel(
  breakthroughReached: boolean,
  hallCount: number,
  strongholdReached: boolean,
): string {
  if (breakthroughReached) return "Breakthrough reached";
  if (hallCount >= 1) return "Cultivation Hall ready";
  if (strongholdReached) return "Stronghold ready · Build Cultivation Hall";
  return "Promote a soldier or build a Cultivation Hall";
}

/**
 * Formats the live progress label for the Cinderjaw boss step.
 * @param bossDefeated - Whether Cinderjaw has been defeated
 * @param spawnedWaves - Number of waves spawned so far
 * @param livingHorde - Number of living horde units
 * @returns Human-readable progress badge text
 */
function formatDefeatBossLabel(
  bossDefeated: boolean,
  spawnedWaves: number,
  livingHorde: number,
): string {
  if (bossDefeated) return "Cinderjaw defeated!";
  const activeWaveOffset = livingHorde > 0 ? 1 : 0;
  const survived = Math.max(0, spawnedWaves - activeWaveOffset);
  return `Waves survived: ${survived} / 5`;
}

/**
 * Evaluates live tutorial progress purely from one simulation snapshot.
 * Works for both solo runs and co-op matches; steps may check off in any order.
 * @param snapshot - Current deterministic sim snapshot
 * @returns Evaluated tutorial checklist, counts, and active step
 */
export function evaluateTutorialProgress(
  snapshot: TutorialWorldView,
): TutorialProgress {
  const slice = isAshenGateSliceState(snapshot.meta[ASHEN_GATE_SLICE_MODULE_ID])
    ? snapshot.meta[ASHEN_GATE_SLICE_MODULE_ID]
    : null;
  const waves = isWaveClockState(snapshot.meta.waves)
    ? snapshot.meta.waves
    : null;

  const playerCount = Math.max(1, Object.keys(slice?.players ?? {}).length);
  const workingVillagers = countWorkingVillagers(snapshot);
  const barracksCount = countCompletedBuildings(snapshot, "barracks");
  const towerCount = countCompletedBuildings(snapshot, "ward_tower");
  const hallCount = countCompletedBuildings(snapshot, "cultivation_hall");
  const breakthroughReached = hasBreakthroughUnit(slice);
  const holdTier = readHoldTier(snapshot);
  const strongholdReached = holdTier === "Stronghold" || holdTier === "Citadel";

  const livingSoldiers = countLivingSoldiers(snapshot);
  const targetSoldiers = playerCount + REQUIRED_EXTRA_SOLDIERS;
  const trainedDelta = Math.max(0, livingSoldiers - playerCount);

  const spawnedWaves = waves?.spawnedWaveIds.length ?? 0;
  const livingHorde = waves?.units.length ?? 0;
  const firstWaveRepelled =
    (spawnedWaves >= 1 && livingHorde === 0) || spawnedWaves >= 2;
  const bossDefeated =
    waves?.bossGateCleared === true || slice?.outcome === "victory";

  const stepStatus: Record<
    TutorialStepId,
    { completed: boolean; progressLabel: string }
  > = {
    build_barracks: {
      completed: barracksCount >= 1,
      progressLabel:
        barracksCount >= 1 ? "Barracks ready" : "0 / 1 Barracks built",
    },
    build_tower: {
      completed: towerCount >= 1,
      progressLabel:
        towerCount >= 1 ? "Ward Tower active" : "0 / 1 Ward Tower built",
    },
    cultivate: {
      completed: hallCount >= 1 || breakthroughReached,
      progressLabel: formatCultivateLabel(
        breakthroughReached,
        hallCount,
        strongholdReached,
      ),
    },
    defeat_boss: {
      completed: bossDefeated,
      progressLabel: formatDefeatBossLabel(
        bossDefeated,
        spawnedWaves,
        livingHorde,
      ),
    },
    defend_wave: {
      completed: firstWaveRepelled,
      progressLabel: formatDefendWaveLabel(
        firstWaveRepelled,
        spawnedWaves,
        livingHorde,
      ),
    },
    gather: {
      completed: workingVillagers >= REQUIRED_WORKING_VILLAGERS,
      progressLabel: `${Math.min(workingVillagers, REQUIRED_WORKING_VILLAGERS)} / ${REQUIRED_WORKING_VILLAGERS} villagers working`,
    },
    train_soldiers: {
      completed: livingSoldiers >= targetSoldiers,
      progressLabel: `${Math.min(trainedDelta, REQUIRED_EXTRA_SOLDIERS)} / ${REQUIRED_EXTRA_SOLDIERS} reinforcements trained`,
    },
  };

  const steps: TutorialStepProgress[] = DESCENT_TUTORIAL_STEPS.map(
    (definition, index) => ({
      ...definition,
      ...stepStatus[definition.id],
      index,
    }),
  );

  const completedCount = steps.filter((step) => step.completed).length;
  const activeStep = steps.find((step) => !step.completed) ?? null;

  return {
    activeStep,
    allComplete: completedCount === steps.length,
    completedCount,
    steps,
    totalCount: steps.length,
  };
}

/**
 * Determines whether the wave director should pause before spawning the next
 * wave so tutorial players can finish key preparation steps without being rushed.
 * - Wave 0 (first scout wave) waits until `train_soldiers` is completed.
 * - Wave 1 (swarm wave) waits until `build_tower` is completed.
 * - Waves 2+ are never held.
 * @param snapshot - Current deterministic sim snapshot
 * @param nextWaveIndex - Zero-based index of the next wave due to spawn
 * @returns True when the wave should be held back
 */
export function shouldHoldWaveForTutorial(
  snapshot: TutorialWorldView,
  nextWaveIndex: number,
): boolean {
  if (nextWaveIndex !== 0 && nextWaveIndex !== 1) return false;
  const requiredStepId: TutorialStepId =
    nextWaveIndex === 0 ? "train_soldiers" : "build_tower";
  const progress = evaluateTutorialProgress(snapshot);
  const step = progress.steps.find((entry) => entry.id === requiredStepId);
  return step !== undefined && !step.completed;
}
