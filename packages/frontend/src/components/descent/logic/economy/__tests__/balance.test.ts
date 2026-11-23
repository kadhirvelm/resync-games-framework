import { describe, expect, test } from "bun:test";
import { generateAshenGateMap } from "../../../data/layers/ashen_gate/generateMap";
import { ASHEN_GATE_STOCKPILE } from "../../../data/layers/ashen_gate/map";
import { readPresentation } from "../../../views/presentation";
import {
  createAshenGateSim,
  createMultiplayerDescentSim,
} from "../../ashenGateSlice";
import { UNIT_DEFINITIONS } from "../../combat/unitCatalog";
import type { SimWorldState } from "../../sim/world";
import { sliceState } from "../../slice/sliceState";
import { cancelTraining, trainingPlan } from "../../slice/sliceTraining";
import { createEconomy } from "../economy";
import { breakthroughPopDelta, countedPop } from "../pop";
import { ensureEconomyMeta } from "../records";
import { basePopCap, buildingDef, trainingCost } from "../tables";

describe("Descent economy balance budgets", () => {
  test("the opening funds a worker and two Wardens, not a free five-unit army", () => {
    const worker = trainingPlan("villager").cost;
    const warden = trainingPlan("warden").cost;
    const food = (ASHEN_GATE_STOCKPILE.food ?? 0) - (worker.food ?? 0);
    const water = (ASHEN_GATE_STOCKPILE.water ?? 0) - (worker.water ?? 0);
    const recruits = Math.min(
      Math.floor(food / (warden.food ?? 1)),
      Math.floor(water / (warden.water ?? 1)),
    );
    expect(recruits).toBe(2);
    expect(ASHEN_GATE_STOCKPILE.wood).toBeGreaterThanOrEqual(
      buildingDef("barracks")?.cost.wood ?? 0,
    );
  });

  test("all training entry points charge the same per-unit resources", () => {
    for (const definition of UNIT_DEFINITIONS) {
      expect(trainingCost(definition.classId)).toEqual(definition.trainingCost);
      expect(trainingPlan(definition.classId).cost).toEqual(
        definition.trainingCost,
      );
    }
  });

  test("one trainer delivers three soldiers or two workers per minute", () => {
    expect(Math.floor(60 / trainingPlan("warden").seconds)).toBe(3);
    expect(Math.floor(60 / trainingPlan("villager").seconds)).toBe(2);
    expect(Math.floor(165 / trainingPlan("warden").seconds)).toBe(8);
  });

  test("clustered deposits buy at most 50 Wardens before worker investment", () => {
    const nodes = generateAshenGateMap(1).nodes;
    const food = nodes
      .filter((node) => node.resourceId === "food")
      .reduce((total, node) => total + node.remaining, 0);
    const water = nodes
      .filter((node) => node.resourceId === "water")
      .reduce((total, node) => total + node.remaining, 0);
    const cost = trainingPlan("warden").cost;
    expect(
      Math.min(
        Math.floor(food / (cost.food ?? 1)),
        Math.floor(water / (cost.water ?? 1)),
      ),
    ).toBe(50);
  });

  test("the Cultivator, Rider and three villagers leave two slots before Housing", () => {
    const opening = readPresentation(
      createAshenGateSim({ seed: 1 }).snapshot().meta,
    ).pop;
    expect(opening).toEqual({ cap: 8, used: 6 });
    expect(basePopCap() - (opening?.used ?? 0)).toBe(2);
    const economy = createEconomy({
      buildings: [
        { buildingType: "housing", completed: true, id: "house", x: 5, y: 5 },
      ],
    });
    expect(economy.getPopCap()).toBe(18);
  });

  test("co-op receives one base allowance per player, not one per room", () => {
    for (const playerCount of [1, 2, 3, 4]) {
      expect(createEconomy({ playerCount }).getPopCap()).toBe(8 * playerCount);
    }
  });

  test("the mounted co-op slice saves and reloads its shared allowance", () => {
    const players = [0, 1, 2, 3].map((slotIndex) => ({
      color: "#abcdef",
      id: `p${slotIndex}`,
      name: `Player ${slotIndex}`,
      slotIndex,
    }));
    const sim = createMultiplayerDescentSim({ players, seed: 12 });
    expect(readPresentation(sim.snapshot().meta).pop).toEqual({
      cap: 32,
      used: 24,
    });
    const reloaded = createMultiplayerDescentSim({ players, seed: 99 });
    reloaded.load(sim.serialize());
    reloaded.step(1);
    expect(readPresentation(reloaded.snapshot().meta).pop).toEqual({
      cap: 32,
      used: 24,
    });
  });

  test("a Rider retains its two reserved population after spawning", () => {
    const rider = {
      classId: "rider",
      popKind: "soldier",
      realmId: "qi_gathering",
    } as const;
    expect(countedPop(rider)).toBe(trainingPlan("rider").pop);
    expect(countedPop({ ...rider, realmId: "core_formation" })).toBe(
      countedPop(rider) +
        breakthroughPopDelta("qi_gathering", "core_formation"),
    );
  });

  test("legacy cancellations refund the historical price, including batches", () => {
    for (const count of [1, 5]) {
      const world = (
        JSON.parse(createAshenGateSim({ seed: 1 }).serialize()) as {
          state: SimWorldState;
        }
      ).state;
      sliceState(world).training = [
        {
          buildingId: "legacy-barracks",
          classId: "warden",
          count,
          id: "legacy-job",
          remainingTicks: 100,
          reservedPop: count,
          totalTicks: 200,
        },
      ];
      const before = { ...world.resources };
      expect(cancelTraining(world, "legacy-barracks", "legacy-job")).toBe(true);
      expect(world.resources.food - before.food).toBe(30 * count);
      expect(world.resources.water - before.water).toBe(15 * count);
    }
  });

  test("legacy co-op saves retain the allowance of eliminated roster members", () => {
    const world = {
      buildings: [],
      meta: {
        ashenGateSlice: { players: { p1: { id: "p1" }, p2: { id: "p2" } } },
        economy: {},
      },
      units: [{ ownerId: "p1" }],
    } as unknown as SimWorldState;
    expect(ensureEconomyMeta(world).playerCount).toBe(2);
  });

  test("legacy co-op saves recover their per-player allowance from ownership", () => {
    const world = {
      buildings: [],
      meta: { economy: {} },
      units: [{ ownerId: "p1" }, { ownerId: "p2" }, { ownerId: "p2" }],
    } as unknown as SimWorldState;
    expect(ensureEconomyMeta(world).playerCount).toBe(2);
    expect(ensureEconomyMeta(world).playerCount).toBe(2);
  });
});
