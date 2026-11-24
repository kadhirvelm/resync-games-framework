import { describe, expect, test } from "bun:test";
import { createAshenGateSim } from "../ashenGateSlice";
import { createBuildingRecord } from "../economy";
import { TICKS_PER_SECOND } from "../sim";
import type { DescentSim } from "../sim/descentSim";
import type { SimWorldState } from "../sim/world";
import { trainingPlan } from "../slice/sliceTraining";

/** @returns IDs of villagers currently in the sim. */
function villagerIds(sim: DescentSim): string[] {
  return sim
    .snapshot()
    .units.filter((unit) => unit.classId === "villager")
    .map((unit) => unit.id);
}

/** Cardinal rally offsets used by the spawn regression cases. */
const RALLY_DIRECTIONS: readonly {
  direction: string;
  dx: number;
  dy: number;
}[] = [
  { direction: "east", dx: 1, dy: 0 },
  { direction: "west", dx: -1, dy: 0 },
  { direction: "north", dx: 0, dy: -1 },
  { direction: "south", dx: 0, dy: 1 },
];

describe("rally-directed training spawns", () => {
  for (const { direction, dx, dy } of RALLY_DIRECTIONS) {
    test(`a Camp spawns a villager on the ${direction} rally side`, () => {
      const sim = createAshenGateSim({ seed: 12, waterways: false });
      const camp = sim
        .snapshot()
        .buildings.find((building) => building.buildingType === "camp");
      if (camp === undefined) throw new Error("Missing Camp");
      const startingVillagers = new Set(villagerIds(sim));
      sim.enqueue({
        buildingId: camp.id,
        type: "set_rally_point",
        x: camp.x + dx * 8,
        y: camp.y + dy * 8,
      });
      sim.enqueue({
        buildingId: camp.id,
        classId: "villager",
        type: "train_unit",
      });
      const budget = (trainingPlan("villager").seconds + 5) * TICKS_PER_SECOND;
      for (
        let tick = 0;
        tick < budget && villagerIds(sim).length === startingVillagers.size;
        tick += 1
      )
        sim.step(1);
      const spawned = sim
        .snapshot()
        .units.find(
          (unit) =>
            !startingVillagers.has(unit.id) && unit.classId === "villager",
        );
      expect(spawned).toBeDefined();
      expect(spawned?.x).toBe(camp.x + dx * 4);
      expect(spawned?.y).toBe(camp.y + dy * 4);
    });
  }

  test("a blocked rally-side cell is skipped for the nearest open cell", () => {
    const sim = createAshenGateSim({ seed: 12, waterways: false });
    const camp = sim
      .snapshot()
      .buildings.find((building) => building.buildingType === "camp");
    if (camp === undefined) throw new Error("Missing Camp");
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    saved.state.buildings.push(
      createBuildingRecord({
        buildingType: "wall",
        completed: true,
        id: "spawn-blocker",
        x: camp.x + 4,
        y: camp.y,
      }),
    );
    sim.load(JSON.stringify(saved));
    const startingVillagers = new Set(villagerIds(sim));
    sim.enqueue({
      buildingId: camp.id,
      type: "set_rally_point",
      x: camp.x + 8,
      y: camp.y,
    });
    sim.enqueue({
      buildingId: camp.id,
      classId: "villager",
      type: "train_unit",
    });
    const budget = (trainingPlan("villager").seconds + 5) * TICKS_PER_SECOND;
    for (
      let tick = 0;
      tick < budget && villagerIds(sim).length === startingVillagers.size;
      tick += 1
    )
      sim.step(1);
    const spawned = sim
      .snapshot()
      .units.find(
        (unit) =>
          !startingVillagers.has(unit.id) && unit.classId === "villager",
      );
    expect(spawned).toBeDefined();
    expect(spawned?.x).toBe(camp.x + 4);
    expect(Math.abs((spawned?.y ?? camp.y) - camp.y)).toBe(1);
  });
});
