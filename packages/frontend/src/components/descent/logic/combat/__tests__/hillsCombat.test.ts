import { describe, expect, test } from "bun:test";
import type { TerrainHill } from "../../layers/layerTypes";
import { CombatSimulation, createCombatUnit } from "../combatSimulation";
import { getUnitDefinition } from "../unitCatalog";

const TEST_HILL: TerrainHill = {
  height: 2.4,
  id: "combat-hill",
  plateauRadius: 5,
  radius: 15,
  x: 30,
  y: 30,
};

describe("Age of Empires hill combat and movement", () => {
  test("firing downhill deals +25% damage and firing uphill deals -25% damage", () => {
    const hunterDef = getUnitDefinition("hunter");
    const highHunter = createCombatUnit(hunterDef, {
      factionId: "hold",
      id: "high-hunter",
      position: { x: 30, y: 30 },
    });
    const lowHunter = createCombatUnit(hunterDef, {
      factionId: "horde",
      id: "low-hunter",
      position: { x: 50, y: 30 },
    });

    const flatSim = new CombatSimulation({
      units: [
        { ...highHunter, position: { ...highHunter.position } },
        { ...lowHunter, position: { ...lowHunter.position } },
      ],
    });
    const flatStartHp = lowHunter.hitPoints;
    flatSim.applyDamage("high-hunter", "low-hunter", 20);
    const flatDamage =
      flatStartHp - (flatSim.getUnit("low-hunter")?.hitPoints ?? 0);

    const hillSim = new CombatSimulation({
      hills: [TEST_HILL],
      units: [highHunter, lowHunter],
    });
    hillSim.applyDamage("high-hunter", "low-hunter", 20);
    const downhillDamage =
      flatStartHp - (hillSim.getUnit("low-hunter")?.hitPoints ?? 0);

    hillSim.applyDamage("low-hunter", "high-hunter", 20);
    const uphillDamage =
      flatStartHp - (hillSim.getUnit("high-hunter")?.hitPoints ?? 0);

    expect(downhillDamage).toBeCloseTo(flatDamage * 1.25, 3);
    expect(uphillDamage).toBeCloseTo(flatDamage * 0.75, 3);
  });

  test("ranged units on a hill gain extra firing range downhill", () => {
    const hunterDef = getUnitDefinition("hunter");
    const beyondBaseRange = hunterDef.attackRange + 0.8;
    const shooter = createCombatUnit(hunterDef, {
      factionId: "hold",
      id: "hill-archer",
      position: { x: 34, y: 30 }, // On hilltop plateau (elevation 2.4)
    });
    const target = createCombatUnit(getUnitDefinition("warden"), {
      factionId: "horde",
      id: "valley-target",
      position: { x: 34 + beyondBaseRange, y: 30 }, // Down on slope/flat
    });

    const hillSim = new CombatSimulation({
      hills: [TEST_HILL],
      units: [shooter, target],
    });
    hillSim.enqueueCommand(
      {
        targetId: "valley-target",
        type: "order_attack",
        unitIds: ["hill-archer"],
      },
      "hold",
    );
    const hillEvents = hillSim.advanceTick();
    expect(
      hillEvents.some(
        (event) =>
          event.kind === "attack_started" && event.sourceId === "hill-archer",
      ),
    ).toBe(true);

    // Same distance on flat ground cannot fire on tick 1 without walking closer.
    const flatSim = new CombatSimulation({
      units: [
        { ...shooter, position: { ...shooter.position } },
        { ...target, position: { ...target.position } },
      ],
    });
    flatSim.enqueueCommand(
      {
        targetId: "valley-target",
        type: "order_attack",
        unitIds: ["hill-archer"],
      },
      "hold",
    );
    const flatEvents = flatSim.advanceTick();
    expect(
      flatEvents.some(
        (event) =>
          event.kind === "attack_started" && event.sourceId === "hill-archer",
      ),
    ).toBe(false);
  });

  test("units walk slower going uphill and faster going downhill than on flat ground", () => {
    const wardenDef = getUnitDefinition("warden");

    const runWalk = (
      hills: readonly TerrainHill[],
      startX: number,
      goalX: number,
    ): number => {
      const unit = createCombatUnit(wardenDef, {
        factionId: "hold",
        id: "walker",
        position: { x: startX, y: 30 },
      });
      const sim = new CombatSimulation({ hills, units: [unit] });
      sim.enqueueCommand(
        { type: "order_move", unitIds: ["walker"], x: goalX, y: 30 },
        "hold",
      );
      for (let tick = 0; tick < 10; tick += 1) {
        sim.advanceTick();
      }
      const after = sim.getUnit("walker");
      return Math.abs((after?.position.x ?? startX) - startX);
    };

    // Hill ramp spans x in [35, 45] (x=35 is hilltop, x=45 is valley).
    const flatDistance = runWalk([], 42, 32);
    const uphillDistance = runWalk([TEST_HILL], 42, 32);
    const downhillDistance = runWalk([TEST_HILL], 38, 48);

    expect(uphillDistance).toBeLessThan(flatDistance);
    expect(downhillDistance).toBeGreaterThan(flatDistance);
  });
});
