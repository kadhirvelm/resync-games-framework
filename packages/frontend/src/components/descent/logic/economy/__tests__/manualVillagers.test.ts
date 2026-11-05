import { describe, expect, test } from "bun:test";
import { createDescentSim, type DescentSim } from "../../sim";
import type { SimModule } from "../../sim/modules";
import { seedEconomyWorld } from "../economy";
import type { EconomyMeta, EconomyUnit } from "../model";
import { createEconomyModule } from "../module";
import { economyHost } from "../records";
import { orderVillagersMove } from "../villagers";

/**
 * Scenario: a finished Camp (7×7, cells 2–8), two villagers beside it, wood
 * next door and wood farther out.
 */
const scenarioModule: SimModule = {
  commands: {
    order_move(command, context) {
      orderVillagersMove(economyHost(context.world), command.unitIds, command);
    },
  },
  id: "manual-villager-scenario",
  init(world) {
    seedEconomyWorld(world, {
      buildings: [
        { buildingType: "camp", completed: true, id: "camp", x: 5, y: 5 },
      ],
      layerId: "ashen_gate",
      nodes: [
        {
          id: "wood-a",
          nodeType: "dead_tree",
          remaining: 10,
          resourceId: "wood",
          x: 11,
          y: 5,
        },
        {
          id: "wood-b",
          nodeType: "dead_tree",
          remaining: 400,
          resourceId: "wood",
          x: 12,
          y: 8,
        },
        {
          id: "food-a",
          nodeType: "fungus_grove",
          remaining: 400,
          resourceId: "food",
          x: 5,
          y: 12,
        },
      ],
      stockpile: { food: 500, stone: 500, water: 500, wood: 500 },
      units: [
        { id: "v1", x: 9, y: 6 },
        { id: "v2", x: 9, y: 4 },
      ],
      veins: [],
    });
  },
};

/**
 * @returns A sim whose villagers only work what they are told
 */
function manualSim(): DescentSim {
  return createDescentSim({
    layerId: "ashen_gate",
    map: { height: 24, width: 24 },
    modules: [createEconomyModule({ manualVillagers: true }), scenarioModule],
    seed: 1,
  });
}

/**
 * @param sim - Sim
 * @param id - Villager id
 * @returns The villager record
 */
function villager(sim: DescentSim, id: string): EconomyUnit {
  const unit = sim.snapshot().units.find((entry) => entry.id === id);
  if (unit === undefined) throw new Error(`Missing ${id}`);
  return unit as EconomyUnit;
}

/**
 * @param sim - Sim
 * @returns Economy meta
 */
function economy(sim: DescentSim): EconomyMeta {
  return sim.snapshot().meta.economy as EconomyMeta;
}

describe("manual villagers", () => {
  test("stand idle until ordered, then gather and deliver", () => {
    const sim = manualSim();
    const wood = sim.snapshot().resources.wood;
    sim.step(40);
    expect(villager(sim, "v1").task).toBeNull();
    expect(sim.snapshot().resources.wood).toBe(wood);

    sim.enqueue({ nodeId: "wood-b", type: "assign_gather", unitIds: ["v1"] });
    sim.step(80);
    expect(sim.snapshot().resources.wood).toBeGreaterThan(wood);
    expect(villager(sim, "v2").task).toBeNull();
  });

  test("move to a dry node's nearest same-resource neighbour", () => {
    const sim = manualSim();
    sim.enqueue({ nodeId: "wood-a", type: "assign_gather", unitIds: ["v1"] });
    sim.step(120);
    expect(
      economy(sim).nodes.find((node) => node.id === "wood-a")?.remaining,
    ).toBe(0);
    expect(villager(sim, "v1").preferredNodeId).toBe("wood-b");
  });

  test("walk to a point and idle there, dropping the gather order", () => {
    const sim = manualSim();
    sim.enqueue({ nodeId: "food-a", type: "assign_gather", unitIds: ["v1"] });
    sim.step(1);
    sim.enqueue({ type: "order_move", unitIds: ["v1"], x: 14, y: 14 });
    sim.step(60);
    const moved = villager(sim, "v1");
    expect({ x: moved.x, y: moved.y }).toEqual({ x: 14, y: 14 });
    expect(moved.task).toBeNull();
    expect(moved.preferredNodeId).toBeNull();
  });

  test("villagers sent to one point stand on separate cells", () => {
    const sim = manualSim();
    sim.enqueue({ type: "order_move", unitIds: ["v1", "v2"], x: 14, y: 14 });
    sim.step(120);
    const first = villager(sim, "v1");
    const second = villager(sim, "v2");
    expect(first.task).toBeNull();
    expect(second.task).toBeNull();
    expect(`${first.x},${first.y}`).not.toBe(`${second.x},${second.y}`);
    expect(Math.max(Math.abs(first.x - 14), Math.abs(first.y - 14))).toBe(0);
    expect(
      Math.max(Math.abs(second.x - 14), Math.abs(second.y - 14)),
    ).toBeLessThanOrEqual(1);
  });

  test("villagers gathering one node each keep their own cell beside it", () => {
    const sim = manualSim();
    sim.enqueue({
      nodeId: "food-a",
      type: "assign_gather",
      unitIds: ["v1", "v2"],
    });
    for (let step = 0; step < 30; step += 1) {
      sim.step(10);
      const first = villager(sim, "v1");
      const second = villager(sim, "v2");
      const bothGathering =
        first.task?.kind === "gather" &&
        second.task?.kind === "gather" &&
        Math.max(Math.abs(first.x - 5), Math.abs(first.y - 12)) <= 1 &&
        Math.max(Math.abs(second.x - 5), Math.abs(second.y - 12)) <= 1;
      if (!bothGathering) continue;
      expect(`${first.x},${first.y}`).not.toBe(`${second.x},${second.y}`);
    }
  });

  test("build a placed site faster with both named builders, then return to work", () => {
    const sim = manualSim();
    sim.enqueue({ nodeId: "food-a", type: "assign_gather", unitIds: ["v1"] });
    sim.step(1);
    sim.enqueue({
      builderIds: ["v1", "v2"],
      buildingType: "housing",
      type: "place_building",
      x: 9,
      y: 13,
    });
    sim.step(1);
    expect(villager(sim, "v1").task?.kind).toBe("build");
    expect(villager(sim, "v2").task?.kind).toBe("build");
    let guard = 0;
    while (guard < 2_000) {
      const site = sim
        .snapshot()
        .buildings.find((building) => building.buildingType === "housing") as
        | { completed?: boolean }
        | undefined;
      if (site?.completed) break;
      sim.step(5);
      guard += 5;
    }
    sim.step(2);
    expect(villager(sim, "v1").preferredNodeId).toBe("food-a");
    expect(villager(sim, "v1").task?.kind).not.toBe("build");
    expect(villager(sim, "v2").task?.kind).not.toBe("build");
  });

  test("an unbuilt site with no builders makes no progress", () => {
    const sim = manualSim();
    sim.enqueue({
      buildingType: "housing",
      type: "place_building",
      x: 9,
      y: 13,
    });
    sim.step(200);
    const site = sim
      .snapshot()
      .buildings.find((building) => building.buildingType === "housing") as
      | { buildTicksDone?: number }
      | undefined;
    expect(site?.buildTicksDone).toBe(0);
  });
});
