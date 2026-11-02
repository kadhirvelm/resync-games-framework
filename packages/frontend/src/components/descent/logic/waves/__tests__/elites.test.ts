import { describe, expect, test } from "bun:test";
import { getUnitDefinition } from "../../combat/unitCatalog";
import { boot, kill, stepTo, waveAt } from "./support";

describe("elite affixes", () => {
  test("Armored resists physical damage and not spells", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, waveAt("ashen_elite_armored"));
    const armored = director
      .getUnits()
      .find((unit) => unit.affix === "armored");
    if (!armored) throw new Error("Armored elite did not spawn");
    expect(armored.classId).toBe("warden");
    const before = armored.hitPoints;
    director.damageUnit(armored.id, 100, "physical");
    const afterPhysical = director
      .getUnits()
      .find((unit) => unit.id === armored.id);
    expect(before - (afterPhysical?.hitPoints ?? before)).toBeCloseTo(50);

    director.damageUnit(armored.id, 100, "spell");
    const afterSpell = director
      .getUnits()
      .find((unit) => unit.id === armored.id);
    expect(
      (afterPhysical?.hitPoints ?? 0) - (afterSpell?.hitPoints ?? 0),
    ).toBeCloseTo(100);
  });

  test("Berserker gains speed as allies die, up to double", () => {
    const { director } = boot("bone_wastes", false);
    stepTo(director, 300);
    const berserker = director
      .getUnits()
      .find((unit) => unit.affix === "berserker");
    if (!berserker) throw new Error("Berserker did not spawn");
    const base = getUnitDefinition("hunter").speed;
    expect(berserker.speed).toBeCloseTo(base);
    const allies = director
      .getUnits()
      .filter(
        (unit) => unit.waveId === berserker.waveId && unit.id !== berserker.id,
      )
      .map((unit) => unit.id);
    expect(allies.length).toBeGreaterThanOrEqual(6);

    for (const unitId of allies.slice(0, 5)) kill(director, unitId);
    const rushed = director.getUnits().find((unit) => unit.id === berserker.id);
    expect(rushed?.speed).toBeCloseTo(base * 2);

    const sixth = allies[5];
    if (!sixth) throw new Error("Berserker wave is missing a sixth ally");
    kill(director, sixth);
    const capped = director.getUnits().find((unit) => unit.id === berserker.id);
    expect(capped?.speed).toBeCloseTo(base * 2);
  });
});
