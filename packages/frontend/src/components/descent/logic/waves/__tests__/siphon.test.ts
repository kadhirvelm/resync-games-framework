import { describe, expect, test } from "bun:test";
import {
  KILL_ESSENCE,
  SIPHON_PAYOUT_FRACTION,
  SIPHON_RADIUS,
} from "../constants";
import { waveDistance } from "../modifiers";
import { boot, kill, stepTo, waveAt } from "./support";

describe("Siphon", () => {
  test("reduces essence from a nearby kill and leaves a distant kill intact", () => {
    const clean = boot("ashen_gate", false);
    stepTo(clean.director, waveAt("ashen_swarm"));
    const ordinary = clean.director.getUnits()[0];
    if (!ordinary) throw new Error("Swarm did not spawn");
    kill(clean.director, ordinary.id);
    expect(clean.director.getKillEssence()).toBe(
      KILL_ESSENCE * clean.runtime.getEssenceGrade(),
    );
    expect(clean.director.getEvents()).toContainEqual({
      amount: KILL_ESSENCE * clean.runtime.getEssenceGrade(),
      siphoned: false,
      type: "essence_payout",
      unitId: ordinary.id,
    });

    const { director, runtime } = boot("blood_sea", false);
    stepTo(director, 300);
    const units = director.getUnits();
    const siphon = units.find((unit) => unit.affix === "siphon");
    if (!siphon) throw new Error("Siphon did not spawn");
    expect(siphon.classId).toBe("raider");
    expect(siphon.lifesteal).toBe(true);
    expect(siphon.school).toBe("blood");
    const near = units.find(
      (unit) =>
        unit.id !== siphon.id && waveDistance(unit, siphon) <= SIPHON_RADIUS,
    );
    const far = units.find(
      (unit) =>
        unit.id !== siphon.id && waveDistance(unit, siphon) > SIPHON_RADIUS,
    );
    if (!near || !far)
      throw new Error("Siphon wave needs a near body and a far body");

    const full = KILL_ESSENCE * runtime.getEssenceGrade();
    kill(director, far.id);
    kill(director, near.id);
    expect(director.getEvents()).toContainEqual({
      amount: full,
      siphoned: false,
      type: "essence_payout",
      unitId: far.id,
    });
    expect(director.getEvents()).toContainEqual({
      amount: full * SIPHON_PAYOUT_FRACTION,
      siphoned: true,
      type: "essence_payout",
      unitId: near.id,
    });
    expect(director.getKillEssence()).toBe(
      full + full * SIPHON_PAYOUT_FRACTION,
    );
  });
});
