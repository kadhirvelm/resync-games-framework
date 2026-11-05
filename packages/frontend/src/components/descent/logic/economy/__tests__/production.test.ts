import { describe, expect, test } from "bun:test";
import { createDescentSim, type DescentSim } from "../../sim";
import type { SimModule } from "../../sim/modules";
import { seedEconomyWorld } from "../economy";
import {
  buildingDef,
  createEconomy,
  growthFraction,
  isRipe,
  workerSlots,
} from "../index";
import type { EconomyBuilding, EconomyUnit } from "../model";
import { createEconomyModule } from "../module";

/**
 * @param buildingType - Producer building id (3×3, centred on 4,4)
 * @param stockpile - Optional starting Water
 * @param workers - How many villagers stand beside it
 * @returns One completed producer in an otherwise empty Hold whose automatic
 *   villagers take the free worker slots
 */
function producer(
  buildingType: string,
  stockpile: { water?: number } = {},
  workers = 0,
) {
  const cells = [
    { x: 2, y: 3 },
    { x: 2, y: 4 },
    { x: 2, y: 5 },
    { x: 6, y: 3 },
  ];
  return createEconomy({
    buildings: [
      { buildingType, completed: true, id: buildingType, x: 4, y: 4 },
    ],
    stockpile,
    units: cells.slice(0, workers).map((cell, index) => ({
      id: `v${index + 1}`,
      ...cell,
    })),
  });
}

/**
 * @param id - Scenario module id
 * @returns A manual-villager sim with a finished Well, Farm, and Forest and
 *   five idle villagers beside them
 */
function manualSim(id: string): DescentSim {
  const scenario: SimModule = {
    commands: {},
    id,
    init(world) {
      seedEconomyWorld(world, {
        buildings: [
          { buildingType: "well", completed: true, id: "well", x: 4, y: 4 },
          { buildingType: "farm", completed: true, id: "farm", x: 10, y: 4 },
          {
            buildingType: "forest",
            completed: true,
            id: "forest",
            x: 17,
            y: 4,
          },
        ],
        layerId: "ashen_gate",
        stockpile: { water: 100 },
        units: [1, 2, 3, 4, 5].map((index) => ({
          id: `v${index}`,
          x: 2 + index,
          y: 9,
        })),
        veins: [],
      });
    },
  };
  return createDescentSim({
    layerId: "ashen_gate",
    map: { height: 24, width: 24 },
    modules: [createEconomyModule({ manualVillagers: true }), scenario],
    seed: 1,
  });
}

/**
 * @param sim - Sim
 * @param buildingId - Producer
 * @returns Villagers whose job is working that producer
 */
function workersOf(sim: DescentSim, buildingId: string): EconomyUnit[] {
  return sim
    .snapshot()
    .units.map((unit) => unit as EconomyUnit)
    .filter(
      (unit) =>
        unit.task?.kind === "work" && unit.task.buildingId === buildingId,
    );
}

describe("worked economy buildings", () => {
  test("Wells take three workers; Farms and Forests take one", () => {
    expect(workerSlots("well")).toBe(3);
    expect(workerSlots("farm")).toBe(1);
    expect(workerSlots("forest")).toBe(1);
    expect(workerSlots("spirit_herb_garden")).toBe(0);
  });

  test("an unworked Well, Farm, or Forest produces nothing", () => {
    for (const type of ["well", "farm", "forest"]) {
      const sim = producer(type, { water: 50 });
      sim.step(200);
      expect(sim.getStockpile()).toMatchObject({
        food: 0,
        water: 50,
        wood: 0,
      });
      expect(sim.listBuildings()[0]?.production).toBeNull();
    }
  });

  test("one villager working the Well draws Water", () => {
    const sim = producer("well", {}, 1);
    const ticks = buildingDef("well")?.production?.everyTicks ?? 0;

    sim.step(ticks - 1);
    expect(sim.getStockpile().water).toBe(0);
    sim.step(1);
    expect(sim.getStockpile().water).toBe(4);
    sim.step(ticks);
    expect(sim.getStockpile().water).toBe(8);
  });

  test("each extra Well worker speeds it up, up to three", () => {
    const one = producer("well", {}, 1);
    const three = producer("well", {}, 3);
    const four = producer("well", {}, 4);
    one.step(48);
    three.step(48);
    four.step(48);
    expect(three.getStockpile().water).toBeGreaterThan(
      one.getStockpile().water,
    );
    expect(four.getStockpile().water).toBe(three.getStockpile().water);
    expect(
      four.listUnits().filter((unit) => unit.task?.kind === "work"),
    ).toHaveLength(3);
  });

  test("worked farms and forests pay Water before their timed harvest", () => {
    const farm = producer("farm", { water: 10 }, 1);
    const farmTicks = buildingDef("farm")?.production?.everyTicks ?? 0;
    farm.step(1);
    expect(farm.getStockpile()).toMatchObject({ food: 0, water: 5 });
    farm.step(farmTicks - 1);
    expect(farm.getStockpile()).toMatchObject({ food: 8, water: 5 });

    const forest = producer("forest", { water: 5 }, 1);
    const forestTicks = buildingDef("forest")?.production?.everyTicks ?? 0;
    forest.step(forestTicks);
    expect(forest.getStockpile()).toMatchObject({ water: 0, wood: 6 });
  });

  test("a second Farm villager does not take a slot or speed it up", () => {
    const sim = producer("farm", { water: 50 }, 2);
    sim.step(24);
    expect(
      sim.listUnits().filter((unit) => unit.task?.kind === "work"),
    ).toHaveLength(1);
    expect(sim.getStockpile().food).toBe(16);
  });

  test("a dry producer waits without advancing or creating resources", () => {
    const sim = producer("farm", {}, 1);
    sim.step(100);
    expect(sim.getStockpile()).toMatchObject({ food: 0, water: 0 });
    expect(sim.listBuildings()[0]?.production).toBeNull();
  });

  test("Spirit Herb Gardens grow on their own, slowly", () => {
    const garden = buildingDef("spirit_herb_garden")?.production;
    const farm = buildingDef("farm")?.production;
    if (!garden || !farm) throw new Error("Missing producer definitions");
    expect(garden.everyTicks).toBeGreaterThan(farm.everyTicks);
    expect(garden.harvest).toBe(true);

    const sim = producer("spirit_herb_garden", { water: 20 });
    sim.step(garden.everyTicks / 2);
    expect(growthFraction(gardenRecord(sim))).toBe(0.5);
    expect(sim.getStockpile().water).toBe(10);
  });

  test("a ripe garden waits for a harvester and starts no new crop", () => {
    const garden = buildingDef("spirit_herb_garden")?.production;
    if (!garden) throw new Error("Missing garden definition");
    const sim = producer("spirit_herb_garden", { water: 20 });
    sim.step(garden.everyTicks + 100);
    expect(isRipe(gardenRecord(sim))).toBe(true);
    expect(sim.getStockpile()).toMatchObject({ spirit_herbs: 0, water: 10 });
  });
});

/**
 * @param sim - Headless Hold with one garden
 * @returns The garden's building record
 */
function gardenRecord(sim: ReturnType<typeof createEconomy>): EconomyBuilding {
  const garden = sim
    .listBuildings()
    .find((building) => building.buildingType === "spirit_herb_garden");
  if (garden === undefined) throw new Error("Missing garden");
  return garden as unknown as EconomyBuilding;
}

/**
 * @param manual - Whether villagers wait for orders
 * @returns A Hold with a Camp drop-off, a Spirit Herb Garden, and two
 *   idle villagers
 */
function gardenSim(manual: boolean): DescentSim {
  const scenario: SimModule = {
    commands: {},
    id: `garden-${manual ? "manual" : "auto"}`,
    init(world) {
      seedEconomyWorld(world, {
        buildings: [
          { buildingType: "camp", completed: true, id: "camp", x: 14, y: 5 },
          {
            buildingType: "spirit_herb_garden",
            completed: true,
            id: "garden",
            x: 4,
            y: 5,
          },
        ],
        layerId: "ashen_gate",
        stockpile: { water: 20 },
        units: [
          { id: "v1", x: 8, y: 10 },
          { id: "v2", x: 9, y: 10 },
        ],
        veins: [],
      });
    },
  };
  return createDescentSim({
    layerId: "ashen_gate",
    map: { height: 24, width: 24 },
    modules: [createEconomyModule({ manualVillagers: manual }), scenario],
    seed: 1,
  });
}

/**
 * @param sim - Garden scenario
 * @returns Villagers holding the garden's harvest job
 */
function harvestersOf(sim: DescentSim): EconomyUnit[] {
  return sim
    .snapshot()
    .units.map((unit) => unit as EconomyUnit)
    .filter((unit) => unit.task?.kind === "harvest");
}

describe("harvesting Spirit Herb Gardens", () => {
  const growSteps =
    buildingDef("spirit_herb_garden")?.production?.everyTicks ?? 0;

  test("an idle automatic villager harvests a ripe crop and carries it home", () => {
    const sim = gardenSim(false);
    sim.step(growSteps - 1);
    expect(harvestersOf(sim)).toHaveLength(0);
    sim.step(40);
    expect(sim.snapshot().resources.spirit_herbs).toBe(2);
  });

  test("a sent villager tends the garden, harvests each crop, and returns", () => {
    const sim = gardenSim(true);
    sim.enqueue({
      buildingId: "garden",
      type: "assign_build",
      unitIds: ["v1", "v2"],
    });
    sim.step(1);
    expect(harvestersOf(sim).map((unit) => unit.id)).toEqual(["v1"]);
    sim.step(growSteps - 2);
    expect(sim.snapshot().resources.spirit_herbs).toBe(0);
    sim.step(40);
    expect(sim.snapshot().resources.spirit_herbs).toBe(2);
    expect(harvestersOf(sim).map((unit) => unit.id)).toEqual(["v1"]);
    sim.step(growSteps * 3);
    expect(sim.snapshot().resources).toMatchObject({
      spirit_herbs: 4,
      water: 0,
    });
  });

  test("a ripe crop nobody is sent to stays in the ground", () => {
    const sim = gardenSim(true);
    sim.step(growSteps * 3);
    expect(sim.snapshot().resources.spirit_herbs).toBe(0);
  });
});

describe("ordering villagers to producers", () => {
  test("only three of four villagers sent to a Well work it", () => {
    const sim = manualSim("well-order");
    sim.enqueue({
      buildingId: "well",
      type: "assign_build",
      unitIds: ["v1", "v2", "v3", "v4"],
    });
    sim.step(1);
    expect(workersOf(sim, "well").map((unit) => unit.id)).toEqual([
      "v1",
      "v2",
      "v3",
    ]);
    sim.step(40);
    expect(sim.snapshot().resources.water).toBeGreaterThan(100);
  });

  test("only one villager works a Farm or a Forest", () => {
    const sim = manualSim("farm-order");
    sim.enqueue({
      buildingId: "farm",
      type: "assign_build",
      unitIds: ["v1", "v2"],
    });
    sim.enqueue({
      buildingId: "forest",
      type: "assign_build",
      unitIds: ["v3", "v4"],
    });
    sim.step(1);
    expect(workersOf(sim, "farm").map((unit) => unit.id)).toEqual(["v1"]);
    expect(workersOf(sim, "forest").map((unit) => unit.id)).toEqual(["v3"]);
    sim.step(80);
    expect(sim.snapshot().resources.food).toBeGreaterThan(0);
    expect(sim.snapshot().resources.wood).toBeGreaterThan(0);
  });

  test("a sheltered worker returns to its producer when released", () => {
    const sim = manualSim("farm-release");
    sim.enqueue({ buildingId: "farm", type: "assign_build", unitIds: ["v1"] });
    sim.step(20);
    sim.enqueue({ type: "recall_villagers" });
    sim.step(20);
    expect(workersOf(sim, "farm")).toHaveLength(0);
    sim.enqueue({ type: "release_villagers" });
    sim.step(2);
    expect(workersOf(sim, "farm").map((unit) => unit.id)).toEqual(["v1"]);
  });
});
