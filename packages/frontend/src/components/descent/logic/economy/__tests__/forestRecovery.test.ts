import { expect, test } from "bun:test";
import { createDescentSim } from "../../sim";
import type { SimModule } from "../../sim/modules";
import { seedEconomyWorld } from "../economy";
import { createEconomyModule } from "../module";
import { asBuilding, asUnit } from "../records";

const exhaustedHold: SimModule = {
  commands: {},
  id: "exhausted-hold",
  init(world) {
    seedEconomyWorld(world, {
      buildings: [
        { buildingType: "camp", completed: true, id: "camp", x: 5, y: 5 },
      ],
      layerId: "ashen_gate",
      nodes: [],
      stockpile: { food: 0, stone: 10, water: 0, wood: 30 },
      units: [{ id: "v1", x: 9, y: 5 }],
      veins: [],
    });
  },
};

test("a Camp spends its remaining wood and stone to build a forest, but needs water for recovery", () => {
  const sim = createDescentSim({
    layerId: "ashen_gate",
    map: { height: 24, width: 24 },
    modules: [createEconomyModule({ manualVillagers: true }), exhaustedHold],
    seed: 1,
  });
  sim.enqueue({
    builderIds: ["v1"],
    buildingType: "forest",
    type: "place_building",
    x: 14,
    y: 5,
  });
  sim.step(1);
  expect(sim.snapshot().resources).toMatchObject({
    stone: 0,
    water: 0,
    wood: 0,
  });
  sim.step(200);
  const forest = sim
    .snapshot()
    .buildings.find((b) => b.buildingType === "forest");
  expect(forest && asBuilding(forest).completed).toBe(true);
  if (!forest) throw new Error("Forest was not built");
  sim.enqueue({ buildingId: forest.id, type: "assign_build", unitIds: ["v1"] });
  sim.step(200);
  const worker = sim.snapshot().units.find((unit) => unit.id === "v1");
  expect(worker && asUnit(worker).task?.kind).toBe("work");
  expect(sim.snapshot().resources.wood).toBe(0);
  expect(sim.snapshot().resources).toMatchObject({ stone: 0, water: 0 });
});
