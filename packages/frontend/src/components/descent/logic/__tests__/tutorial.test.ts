import { describe, expect, it } from "bun:test";
import type { AshenCruciblePlayer } from "../../data/layers/ashen_crucible";
import {
  createMultiplayerDescentSim,
  TUTORIAL_STOCKPILE_BONUS,
  TUTORIAL_WAVE_STAT_SCALE,
  TUTORIAL_WAVE_TIME_SCALE,
} from "../ashenGateSlice";
import { secondsToTicks } from "../sim/constants";
import { DESCENT_TUTORIAL_STEPS, evaluateTutorialProgress } from "../tutorial";
import { isWaveClockState } from "../waves/clock";

const TWO_PLAYERS: readonly AshenCruciblePlayer[] = [
  { color: "#f2c14e", id: "p1", name: "Commander A", slotIndex: 0 },
  { color: "#4db8ff", id: "p2", name: "Commander B", slotIndex: 1 },
];

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

    // At 95s, standard wave 1 (90s) has spawned, while tutorial wave 1 (135s) has not.
    const ninetyFiveSeconds = secondsToTicks(95);
    standard.step(ninetyFiveSeconds);
    tutorial.step(ninetyFiveSeconds);

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

    // At 140s, tutorial wave 1 spawns with reduced HP compared to standard wave 1.
    tutorial.step(secondsToTicks(45));
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
