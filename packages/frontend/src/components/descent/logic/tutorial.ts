import { asBuilding, isEconomyUnit } from "./economy/records";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  isAshenGateSliceState,
} from "./slice/sliceState";
import type { SimSnapshot } from "./types";
import { isWaveClockState } from "./waves/clock";

/** Stable identifiers for each co-op tutorial step, in teaching order. */
export type TutorialStepId =
  | "gather"
  | "build_barracks"
  | "train_soldiers"
  | "build_tower"
  | "defend_wave"
  | "cultivate"
  | "defeat_boss";

/** Static teaching copy for one co-op tutorial step. */
export interface TutorialStepDefinition {
  /** Actionable step-by-step instructions. */
  detail: string;
  /** Keycap badges highlighted beside the instructions. */
  hotkeys: readonly string[];
  id: TutorialStepId;
  /** Co-op strategy tip for surviving Descent. */
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

/** Complete evaluated progress of the co-op tutorial for one snapshot. */
export interface TutorialProgress {
  /** First incomplete step, or `null` once every step is complete. */
  activeStep: TutorialStepProgress | null;
  allComplete: boolean;
  completedCount: number;
  steps: readonly TutorialStepProgress[];
  totalCount: number;
}

/** Ordered curriculum for the Descent co-op multiplayer tutorial. */
export const DESCENT_TUTORIAL_STEPS: readonly TutorialStepDefinition[] = [
  {
    detail:
      "Select your Villagers (click, drag-box, or press . for idle villagers), then right-click a nearby Dead Tree, Rock Vein, Fungus Grove, or Spirit Spring.",
    hotkeys: [".", "Right-Click"],
    id: "gather",
    tip: "All commanders share one stockpile. Split gathering duties so one player covers Wood & Stone while another grabs Food & Water.",
    title: "Put Villagers to Work",
  },
  {
    detail:
      "Press B (or click Build), choose Barracks, and click open ground near your Camp. Nearby villagers will walk over and construct it.",
    hotkeys: ["B", "Left-Click"],
    id: "build_barracks",
    tip: "Building a Training Yard beside your Barracks grants bonus recruit XP, and placing on a glowing Spirit Vein adds +15% train speed.",
    title: "Build a Barracks",
  },
  {
    detail:
      "Select a completed Barracks and train at least 2 Wardens. Right-click ground with the Barracks selected to set a Rally Point.",
    hotkeys: ["Click Barracks", "Right-Click"],
    id: "train_soldiers",
    tip: "Every commander starts with 1 Captain Warden. Upgrading your Camp to an Outpost unlocks Hunters and Riders at the Barracks.",
    title: "Train Reinforcements",
  },
  {
    detail:
      "Select your Camp and upgrade to Outpost, then open Build (B) and construct a Ward Tower east of your Camps facing the approaching lanes.",
    hotkeys: ["Click Camp", "B", "Ward Tower"],
    id: "build_tower",
    tip: "Fight beside your Ward Towers for free covering fire, and pull wounded soldiers back behind them to stay alive.",
    title: "Upgrade to Outpost & Build a Ward Tower",
  },
  {
    detail:
      "Select your soldiers, press A, and click east to Attack-Move into the first Horde scout wave. Wipe out every raider in the wave!",
    hotkeys: ["A", "Left-Click"],
    id: "defend_wave",
    tip: "Allied players cannot harm each other. Coordinate flanks and use Formations (Ranks, Wedge, Line) so tanks stay in front.",
    title: "Repel the First Scout Wave",
  },
  {
    detail:
      "Select your Camp and click Upgrade Hold to reach Stronghold tier, then open Build (B) and construct a Cultivation Hall to unlock soldier Breakthroughs.",
    hotkeys: ["Click Camp", "B"],
    id: "cultivate",
    tip: "Slaying Horde enemies grants Merit and Essence. Once a soldier fills both, select them and click Breakthrough to ascend and pick Ember, Rime, or Blood!",
    title: "Upgrade Hold & Build Cultivation Hall",
  },
  {
    detail:
      "Keep training soldiers, expand to mid-field Iron and Essence deposits, defeat Cinderjaw when the boss arrives from the east, and click Descend!",
    hotkeys: ["Space", "1×–4×"],
    id: "defeat_boss",
    tip: "Press Space anytime to pause in co-op and plan together, or speed up between waves. Watch out for glowing Ember Vents during the boss fight!",
    title: "Slay Cinderjaw Together",
  },
] as const;

/** Number of working villagers required to complete Step 1. */
const REQUIRED_WORKING_VILLAGERS = 2;

/** Additional soldiers beyond starting Captains required for Step 3. */
const REQUIRED_EXTRA_SOLDIERS = 2;

/**
 * Counts how many completed buildings of a given type exist in the world.
 * @param snapshot - Current sim snapshot
 * @param buildingType - Economy building id
 * @returns Completed building count
 */
function countCompletedBuildings(
  snapshot: SimSnapshot,
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
 * @param snapshot - Current sim snapshot
 * @returns Active (non-idle) villager count
 */
function countWorkingVillagers(snapshot: SimSnapshot): number {
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
 * @param snapshot - Current sim snapshot
 * @returns Living soldier count
 */
function countLivingSoldiers(snapshot: SimSnapshot): number {
  let count = 0;
  for (const unit of snapshot.units) {
    if (!isEconomyUnit(unit)) continue;
    if (unit.popKind !== "soldier" || unit.hp <= 0) continue;
    count += 1;
  }
  return count;
}

/**
 * Reads the current Hold tier from `meta.economy`, defaulting to `"Camp"`.
 * @param snapshot - Current sim snapshot
 * @returns Current Hold tier string
 */
function readHoldTier(snapshot: SimSnapshot): string {
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
 * Evaluates live co-op tutorial progress purely from one simulation snapshot.
 * Steps can be completed collaboratively by any allied commander and may
 * check off in any order.
 * @param snapshot - Current deterministic sim snapshot
 * @returns Evaluated tutorial checklist, counts, and active step
 */
export function evaluateTutorialProgress(
  snapshot: SimSnapshot,
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
      completed: hallCount >= 1,
      progressLabel:
        hallCount >= 1
          ? "Cultivation Hall ready"
          : strongholdReached
            ? "Stronghold ready · Build Cultivation Hall"
            : "Upgrade Camp to Stronghold first",
    },
    defeat_boss: {
      completed: bossDefeated,
      progressLabel: bossDefeated
        ? "Cinderjaw defeated!"
        : `Waves survived: ${Math.max(0, spawnedWaves - (livingHorde > 0 ? 1 : 0))} / 5`,
    },
    defend_wave: {
      completed: firstWaveRepelled,
      progressLabel: firstWaveRepelled
        ? "Scout wave cleared"
        : spawnedWaves === 0
          ? "Waiting for first scout wave"
          : `${livingHorde} raider${livingHorde === 1 ? "" : "s"} remaining`,
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
