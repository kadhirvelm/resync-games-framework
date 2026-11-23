import { describe, expect, test } from "bun:test";
import type { DescentPresentation } from "../../views/presentation";
import { createAshenGateSim } from "../ashenGateSlice";
import { buildingDef, createEconomy, workerSlots } from "../economy";

/** Creates a forest with a distant drop-off and up to two adjacent villagers. */
function forestScenario(workers: number, water = 0) {
  return createEconomy({
    buildings: [
      { buildingType: "forest", completed: true, id: "forest", x: 5, y: 5 },
      { buildingType: "storehouse", completed: true, id: "store", x: 5, y: 13 },
    ],
    stockpile: { water },
    units: [
      { id: "v1", x: 2, y: 5 },
      { id: "v2", x: 2, y: 6 },
    ].slice(0, workers),
  });
}

describe("managed forest", () => {
  test("is available at Camp", () => {
    const sim = createAshenGateSim({ seed: 17 });
    const option = (
      sim.snapshot().meta.ui as DescentPresentation
    ).buildOptions?.find((entry) => entry.buildingType === "forest");
    expect(option).toBeDefined();
    expect(option?.unlocked).toBe(true);
  });

  test("costs wood and stone and consumes water to produce wood", () => {
    expect(buildingDef("forest")?.cost).toEqual({ stone: 10, wood: 30 });
    expect(buildingDef("forest")?.production).toMatchObject({
      everyTicks: 16,
      input: { water: 5 },
      output: { wood: 6 },
      workers: 1,
    });
  });

  test("does not produce without a worker", () => {
    expect(workerSlots("forest")).toBe(1);
    const idle = forestScenario(0);
    idle.step(100);
    expect(idle.getStockpile()).toMatchObject({ water: 0, wood: 0 });
    expect(
      idle.listBuildings().find((building) => building.id === "forest")
        ?.production,
    ).toBeNull();
  });

  test("cannot produce wood without water", () => {
    const forest = forestScenario(1);
    forest.step(200);
    expect(forest.getStockpile()).toMatchObject({ water: 0, wood: 0 });
    expect(
      forest.listBuildings().find((building) => building.id === "forest")
        ?.production,
    ).toBeNull();
  });

  test("repeatedly hauls wood using water and respects the worker cap", () => {
    const one = forestScenario(1, 100);
    const two = forestScenario(2, 100);
    const ticks = buildingDef("forest")?.production?.everyTicks;
    if (!ticks) throw new Error("Missing forest production");
    one.step(ticks);
    expect(one.getStockpile().wood).toBe(0);
    one.step(30);
    const firstDelivery = one.getStockpile().wood;
    expect(firstDelivery).toBeGreaterThanOrEqual(6);
    one.step(100);
    two.step(ticks + 130);
    expect(one.getStockpile().wood).toBeGreaterThan(firstDelivery);
    expect(one.getStockpile().water).toBeLessThan(100);
    expect(two.getStockpile().wood).toBeGreaterThanOrEqual(12);
    expect(
      two.listUnits().filter((unit) => unit.task?.kind === "work"),
    ).toHaveLength(1);
  });
});
