import { describe, expect, it } from "bun:test";
import type { AshenCruciblePlayer } from "../../data/layers/ashen_crucible";
import {
  createMultiplayerDescentSim,
  TUTORIAL_STOCKPILE_BONUS,
  TUTORIAL_WAVE_STAT_SCALE,
  TUTORIAL_WAVE_TIME_SCALE,
} from "../ashenGateSlice";
import type { EconomyBuilding, EconomyUnit } from "../economy/model";
import { createBuildingRecord, createUnitRecord } from "../economy/records";
import { secondsToTicks } from "../sim/constants";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  createSliceState,
} from "../slice/sliceState";
import {
  DESCENT_TUTORIAL_STEPS,
  evaluateTutorialProgress,
  shouldHoldWaveForTutorial,
  type TutorialStepId,
  type TutorialTargetHint,
} from "../tutorial";
import type { SimSnapshot } from "../types";
import { createWaveState, isWaveClockState } from "../waves/clock";
import type { WaveClockState } from "../waves/types";

const TWO_PLAYERS: readonly AshenCruciblePlayer[] = [
  { color: "#f2c14e", id: "p1", name: "Commander A", slotIndex: 0 },
  { color: "#4db8ff", id: "p2", name: "Commander B", slotIndex: 1 },
];

/**
 * Builds an economy villager record for snapshot-based tutorial tests.
 * @param id - Unique unit id
 * @param working - Whether the villager currently has an active task
 * @returns EconomyUnit snapshot record
 */
function makeVillager(id: string, working: boolean): EconomyUnit {
  const unit = createUnitRecord({ classId: "villager", id, x: 5, y: 5 });
  if (working) {
    unit.task = { gatherTicksLeft: 10, kind: "gather", nodeId: "node-1" };
  }
  return unit;
}

/**
 * Builds an economy soldier record for snapshot-based tutorial tests.
 * @param id - Unique unit id
 * @returns EconomyUnit snapshot record
 */
function makeSoldier(id: string): EconomyUnit {
  return createUnitRecord({ classId: "warden", id, x: 10, y: 10 });
}

/**
 * Builds an economy building record for snapshot-based tutorial tests.
 * @param id - Unique building id
 * @param buildingType - Economy building type id
 * @param completed - Whether construction is complete
 * @returns EconomyBuilding snapshot record
 */
function makeBuilding(
  id: string,
  buildingType: string,
  completed = true,
): EconomyBuilding {
  return createBuildingRecord({ buildingType, completed, id, x: 8, y: 8 });
}

/**
 * Builds a minimal deterministic SimSnapshot with customizable slice/wave/economy state.
 * @param overrides - Partial overrides for units, buildings, slice, waves, and tier
 * @returns Synthetic SimSnapshot for unit testing
 */
function makeSnapshot(overrides?: {
  buildings?: EconomyBuilding[];
  slice?: Partial<ReturnType<typeof createSliceState>>;
  tier?: string;
  units?: EconomyUnit[];
  waves?: Partial<WaveClockState>;
}): SimSnapshot {
  const slice = {
    ...createSliceState(),
    ...overrides?.slice,
  };
  const waves: WaveClockState = {
    ...createWaveState("ashen_gate", 0),
    ...overrides?.waves,
  };
  return {
    buildings: overrides?.buildings ?? [],
    layerId: "ashen_gate",
    map: { height: 48, width: 64 },
    meta: {
      [ASHEN_GATE_SLICE_MODULE_ID]: slice,
      economy: { tier: overrides?.tier ?? "Camp" },
      waves,
    },
    paused: false,
    resources: {
      coin: 0,
      essence: 0,
      food: 100,
      iron: 0,
      spirit_herbs: 0,
      stone: 100,
      water: 100,
      wood: 100,
    },
    speed: 1,
    tick: 0,
    units: overrides?.units ?? [],
  };
}

describe("Descent tutorial curriculum & rules", () => {
  it("orders steps so defending the first scout wave comes before Outpost & Ward Tower", () => {
    const expectedOrder: readonly TutorialStepId[] = [
      "gather",
      "build_barracks",
      "train_soldiers",
      "defend_wave",
      "build_tower",
      "cultivate",
      "defeat_boss",
    ];

    expect(DESCENT_TUTORIAL_STEPS.map((step) => step.id)).toEqual(
      expectedOrder,
    );
    expect(
      DESCENT_TUTORIAL_STEPS.findIndex((s) => s.id === "defend_wave"),
    ).toBeLessThan(
      DESCENT_TUTORIAL_STEPS.findIndex((s) => s.id === "build_tower"),
    );
  });

  it("maps every step to its expected targetHint and keeps copy concise and solo-friendly", () => {
    const expectedHints: Record<TutorialStepId, TutorialTargetHint> = {
      build_barracks: "build_barracks",
      build_tower: "camp",
      cultivate: "camp",
      defeat_boss: "boss",
      defend_wave: "soldiers",
      gather: "idle_villagers",
      train_soldiers: "barracks",
    };

    for (const step of DESCENT_TUTORIAL_STEPS) {
      expect(step.targetHint).toBe(expectedHints[step.id]);
      expect(step.instructions.length).toBeGreaterThanOrEqual(3);
      expect(
        step.instructions.every((instruction) => instruction.length > 0),
      ).toBe(true);
      expect(step.detail.includes("\n")).toBe(false);
      expect(step.detail.length).toBeLessThanOrEqual(110);
      expect(step.tip.toLowerCase()).not.toContain("all commanders");
      expect(step.tip.toLowerCase()).not.toContain("in co-op");
    }
  });

  it("teaches the real movement controls and complete build menu paths", () => {
    const instructions = (id: TutorialStepId) =>
      DESCENT_TUTORIAL_STEPS.find((step) => step.id === id)?.instructions.join(
        " ",
      ) ?? "";
    expect(instructions("build_barracks")).toContain("Military");
    expect(instructions("build_tower")).toContain("Defense");
    expect(instructions("build_tower")).toContain("confirm Upgrade Hold");
    expect(instructions("cultivate")).toContain(
      "Cultivation, then Cultivation Hall",
    );
    expect(instructions("defend_wave")).toContain("Right-click an enemy");
    expect(instructions("defeat_boss")).toContain("right-click ground");
    for (const step of DESCENT_TUTORIAL_STEPS) {
      expect(step.hotkeys).not.toContain("A");
      expect(step.instructions.join(" ")).not.toContain("press A");
    }
  });

  it("evaluates completion conditions accurately across all 7 steps", () => {
    const empty = makeSnapshot({
      units: [makeVillager("v1", false), makeSoldier("cap-1")],
    });
    const emptyProgress = evaluateTutorialProgress(empty);
    expect(emptyProgress.completedCount).toBe(0);
    expect(emptyProgress.activeStep?.id).toBe("gather");

    // Step 1: gather (2 working villagers)
    const gathered = makeSnapshot({
      units: [
        makeVillager("v1", true),
        makeVillager("v2", true),
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
      ],
    });
    expect(evaluateTutorialProgress(gathered).activeStep?.id).toBe(
      "build_barracks",
    );

    // Step 2: build_barracks (uncompleted barracks should NOT complete)
    const unfinishedBarracks = makeSnapshot({
      buildings: [makeBuilding("b1", "barracks", false)],
      units: [
        makeVillager("v1", true),
        makeVillager("v2", true),
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
      ],
    });
    expect(evaluateTutorialProgress(unfinishedBarracks).activeStep?.id).toBe(
      "build_barracks",
    );

    const builtBarracks = makeSnapshot({
      buildings: [makeBuilding("b1", "barracks", true)],
      units: [
        makeVillager("v1", true),
        makeVillager("v2", true),
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
      ],
    });
    expect(evaluateTutorialProgress(builtBarracks).activeStep?.id).toBe(
      "train_soldiers",
    );

    // Step 3: train_soldiers (Captain + Rider + 2 trained in solo = 4)
    const trained = makeSnapshot({
      buildings: [makeBuilding("b1", "barracks", true)],
      units: [
        makeVillager("v1", true),
        makeVillager("v2", true),
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
        makeSoldier("s1"),
        makeSoldier("s2"),
      ],
    });
    expect(evaluateTutorialProgress(trained).activeStep?.id).toBe(
      "defend_wave",
    );

    // Step 4: defend_wave (active raiders still alive -> incomplete; cleared -> complete)
    const waveInProgress = makeSnapshot({
      buildings: [makeBuilding("b1", "barracks", true)],
      units: [
        makeVillager("v1", true),
        makeVillager("v2", true),
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
        makeSoldier("s1"),
        makeSoldier("s2"),
      ],
      waves: {
        spawnedWaveIds: ["wave-1"],
        units: [
          {
            attackDamage: 5,
            attackRange: 1,
            baseMaxHitPoints: 40,
            classId: "raider",
            hitPoints: 40,
            id: "h1",
            kind: "raider",
            maxHitPoints: 40,
            moveSpeed: 3,
            school: null,
            x: 50,
            y: 20,
          },
        ] as unknown as WaveClockState["units"],
      },
    });
    expect(evaluateTutorialProgress(waveInProgress).activeStep?.id).toBe(
      "defend_wave",
    );

    const waveCleared = makeSnapshot({
      buildings: [makeBuilding("b1", "barracks", true)],
      units: [
        makeVillager("v1", true),
        makeVillager("v2", true),
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
        makeSoldier("s1"),
        makeSoldier("s2"),
      ],
      waves: {
        spawnedWaveIds: ["wave-1"],
        units: [],
      },
    });
    expect(evaluateTutorialProgress(waveCleared).activeStep?.id).toBe(
      "build_tower",
    );

    // Step 5: build_tower
    const towerBuilt = makeSnapshot({
      buildings: [
        makeBuilding("b1", "barracks", true),
        makeBuilding("t1", "ward_tower", true),
      ],
      tier: "Outpost",
      units: [
        makeVillager("v1", true),
        makeVillager("v2", true),
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
        makeSoldier("s1"),
        makeSoldier("s2"),
      ],
      waves: {
        spawnedWaveIds: ["wave-1"],
        units: [],
      },
    });
    expect(evaluateTutorialProgress(towerBuilt).activeStep?.id).toBe(
      "cultivate",
    );

    // Step 6: cultivate completes via Cultivation Hall OR Sworn unit OR chosen school
    const viaHall = makeSnapshot({
      buildings: [makeBuilding("h1", "cultivation_hall", true)],
    });
    expect(
      evaluateTutorialProgress(viaHall).steps.find((s) => s.id === "cultivate")
        ?.completed,
    ).toBe(true);

    const viaSworn = makeSnapshot({
      slice: {
        cultivation: {
          groundTreasures: [],
          inventoryTreasures: [],
          units: [
            {
              appliedPills: [],
              combatProof: 0,
              equippedTreasures: [],
              essence: 0,
              isHero: false,
              merit: 0,
              rank: "Sworn",
              unitId: "cap-1",
            },
          ],
        },
      },
    });
    expect(
      evaluateTutorialProgress(viaSworn).steps.find((s) => s.id === "cultivate")
        ?.completed,
    ).toBe(true);

    const viaSchool = makeSnapshot({
      slice: {
        cultivation: {
          groundTreasures: [],
          inventoryTreasures: [],
          units: [
            {
              appliedPills: [],
              combatProof: 0,
              equippedTreasures: [],
              essence: 0,
              isHero: false,
              merit: 0,
              rank: "Ashborn",
              school: "ember",
              unitId: "cap-1",
            },
          ],
        },
      },
    });
    expect(
      evaluateTutorialProgress(viaSchool).steps.find(
        (s) => s.id === "cultivate",
      )?.completed,
    ).toBe(true);

    // Step 7: defeat_boss completes on bossGateCleared or victory outcome
    const allDone = makeSnapshot({
      buildings: [
        makeBuilding("b1", "barracks", true),
        makeBuilding("t1", "ward_tower", true),
        makeBuilding("h1", "cultivation_hall", true),
      ],
      units: [
        makeVillager("v1", true),
        makeVillager("v2", true),
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
        makeSoldier("s1"),
        makeSoldier("s2"),
      ],
      waves: {
        bossGateCleared: true,
        spawnedWaveIds: ["wave-1", "wave-2", "wave-3", "wave-4", "wave-5"],
        units: [],
      },
    });
    const finalProgress = evaluateTutorialProgress(allDone);
    expect(finalProgress.allComplete).toBe(true);
    expect(finalProgress.activeStep).toBeNull();
    expect(finalProgress.completedCount).toBe(DESCENT_TUTORIAL_STEPS.length);
  });

  it("holds wave 0 until train_soldiers, wave 1 until build_tower, and never waves 2+", () => {
    const fresh = makeSnapshot({
      units: [makeSoldier("cap-1")],
    });
    expect(shouldHoldWaveForTutorial(fresh, 0)).toBe(true);
    expect(shouldHoldWaveForTutorial(fresh, 1)).toBe(true);
    expect(shouldHoldWaveForTutorial(fresh, 2)).toBe(false);
    expect(shouldHoldWaveForTutorial(fresh, 4)).toBe(false);
    expect(shouldHoldWaveForTutorial(fresh, -1)).toBe(false);

    // Once 2 reinforcements are trained, wave 0 is released but wave 1 stays held.
    const trained = makeSnapshot({
      units: [
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
        makeSoldier("s1"),
        makeSoldier("s2"),
      ],
    });
    expect(shouldHoldWaveForTutorial(trained, 0)).toBe(false);
    expect(shouldHoldWaveForTutorial(trained, 1)).toBe(true);
    expect(shouldHoldWaveForTutorial(trained, 2)).toBe(false);

    // Once a Ward Tower is built, wave 1 is also released.
    const fortified = makeSnapshot({
      buildings: [makeBuilding("t1", "ward_tower", true)],
      units: [
        makeSoldier("cap-1"),
        makeSoldier("rider-1"),
        makeSoldier("s1"),
        makeSoldier("s2"),
      ],
    });
    expect(shouldHoldWaveForTutorial(fortified, 0)).toBe(false);
    expect(shouldHoldWaveForTutorial(fortified, 1)).toBe(false);
    expect(shouldHoldWaveForTutorial(fortified, 2)).toBe(false);
  });
});

describe("Descent co-op multiplayer tutorial", () => {
  it("grants bonus supplies and gentler, slower waves in tutorial mode", () => {
    const standard = createMultiplayerDescentSim({
      mapId: "ashen_crucible",
      players: TWO_PLAYERS,
      seed: 42,
    });
    const tutorial = createMultiplayerDescentSim({
      mapId: "ashen_crucible_tutorial",
      players: TWO_PLAYERS,
      seed: 42,
    });

    const stdSnap = standard.snapshot();
    const tutSnap = tutorial.snapshot();

    expect(tutSnap.resources.wood).toBe(
      stdSnap.resources.wood + TUTORIAL_STOCKPILE_BONUS.wood,
    );
    expect(tutSnap.resources.stone).toBe(
      stdSnap.resources.stone + TUTORIAL_STOCKPILE_BONUS.stone,
    );
    expect(tutSnap.resources.food).toBe(
      stdSnap.resources.food + TUTORIAL_STOCKPILE_BONUS.food,
    );
    expect(tutSnap.resources.essence).toBe(
      stdSnap.resources.essence + TUTORIAL_STOCKPILE_BONUS.essence,
    );

    const tutWaves = tutSnap.meta.waves;
    expect(isWaveClockState(tutWaves)).toBe(true);
    if (isWaveClockState(tutWaves)) {
      expect(tutWaves.waveTimeScale).toBe(TUTORIAL_WAVE_TIME_SCALE);
      expect(tutWaves.waveStatScale).toBe(TUTORIAL_WAVE_STAT_SCALE);
    }

    // At 125s, standard wave 1 (120s) has spawned, while tutorial wave 1 (180s) has not.
    const pastStandardWaveOne = secondsToTicks(125);
    standard.step(pastStandardWaveOne);
    tutorial.step(pastStandardWaveOne);

    const stdWavesAfter = standard.snapshot().meta.waves;
    const tutWavesAfter = tutorial.snapshot().meta.waves;
    expect(
      isWaveClockState(stdWavesAfter) &&
        stdWavesAfter.spawnedWaveIds.length === 1,
    ).toBe(true);
    expect(
      isWaveClockState(tutWavesAfter) &&
        tutWavesAfter.spawnedWaveIds.length === 0,
    ).toBe(true);

    // At 185s, tutorial wave 1 spawns with reduced HP compared to standard wave 1.
    tutorial.step(secondsToTicks(60));
    const tutWavesSpawned = tutorial.snapshot().meta.waves;
    expect(
      isWaveClockState(tutWavesSpawned) &&
        tutWavesSpawned.spawnedWaveIds.length === 1,
    ).toBe(true);
    if (
      isWaveClockState(stdWavesAfter) &&
      isWaveClockState(tutWavesSpawned) &&
      stdWavesAfter.units[0] &&
      tutWavesSpawned.units[0]
    ) {
      expect(tutWavesSpawned.units[0].baseMaxHitPoints).toBeLessThan(
        stdWavesAfter.units[0].baseMaxHitPoints,
      );
    }
  });

  it("evaluates tutorial progress cleanly from a fresh snapshot through milestones", () => {
    const sim = createMultiplayerDescentSim({
      mapId: "ashen_crucible_tutorial",
      players: TWO_PLAYERS,
      seed: 99,
    });

    const initial = evaluateTutorialProgress(sim.snapshot());
    expect(initial.totalCount).toBe(DESCENT_TUTORIAL_STEPS.length);
    expect(initial.completedCount).toBe(0);
    expect(initial.allComplete).toBe(false);
    expect(initial.activeStep?.id).toBe("gather");

    // Assign two villagers to gather a nearby resource node.
    const snap = sim.snapshot();
    const p1Villagers = snap.units.filter(
      (u) => u.classId === "villager" && u.ownerId === "p1",
    );
    const camp = snap.buildings.find(
      (b) => b.buildingType === "camp" && b.ownerId === "p1",
    );
    expect(p1Villagers.length).toBeGreaterThanOrEqual(2);
    expect(camp).toBeDefined();

    // Find a wood node near p1's camp via economy meta.
    const economy = snap.meta.economy as {
      nodes?: Array<{ id: string; resourceId: string; x: number; y: number }>;
    };
    const woodNode = economy.nodes?.find((n) => n.resourceId === "wood");
    expect(woodNode).toBeDefined();

    if (woodNode && p1Villagers[0] && p1Villagers[1]) {
      sim.enqueue({
        actorId: "p1",
        nodeId: woodNode.id,
        type: "assign_gather",
        unitIds: [p1Villagers[0].id, p1Villagers[1].id],
      });
      sim.step(15);
    }

    const afterGather = evaluateTutorialProgress(sim.snapshot());
    const gatherStep = afterGather.steps.find((s) => s.id === "gather");
    expect(gatherStep?.completed).toBe(true);
    expect(afterGather.activeStep?.id).toBe("build_barracks");
  });
});
