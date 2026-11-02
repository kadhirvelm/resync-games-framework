import { describe, expect, test } from "bun:test";
import { getBossDefinition } from "../catalog";
import { secondsToWaveTicks } from "../constants";
import { boot, kill, stepTo, waveAt } from "./support";

describe("boss gate", () => {
  test("a living boss blocks descent and the kill opens it", () => {
    const { director, runtime } = boot("ashen_gate", false);
    stepTo(director, waveAt("ashen_boss"));
    const intro = director
      .getEvents()
      .find((event) => event.type === "boss_intro");
    expect(intro).toEqual({
      bossId: "cinderjaw",
      layerId: "ashen_gate",
      type: "boss_intro",
    });
    expect(intro && "lines" in intro).toBe(false);
    expect(runtime.isBossGateCleared()).toBe(false);
    expect(director.requestDescend()).toEqual({
      ok: false,
      reason: "boss_gate_closed",
    });

    const boss = director.getUnits().find((unit) => unit.role === "boss");
    expect(boss?.aoeRadius).toBe(3.5);
    if (!boss) throw new Error("Cinderjaw did not spawn");
    kill(director, boss.id);

    const bossDef = getBossDefinition("cinderjaw");
    expect(runtime.isBossGateCleared()).toBe(true);
    expect(director.getDrops()).toEqual({
      bossCoreId: bossDef.bossCoreId,
      essence: bossDef.essenceBase * runtime.getEssenceGrade(),
      treasureChoice: [...bossDef.treasureChoice],
    });
    expect(director.requestDescend()).toEqual({ ok: true });
    expect(runtime.getActiveLayer().id).toBe("bone_wastes");
    expect(runtime.isBossGateCleared()).toBe(false);
  });

  test("Cinderjaw's vent imps arrive only after the wind-up", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, waveAt("ashen_boss"));
    const boss = director.getUnits().find((unit) => unit.role === "boss");
    if (!boss) throw new Error("Cinderjaw did not spawn");
    const windup = secondsToWaveTicks(
      getBossDefinition("cinderjaw").windupSeconds,
    );
    director.damageUnit(boss.id, boss.hitPoints - boss.maxHitPoints * 0.5 + 1);
    expect(
      director.getUnits().filter((unit) => unit.role === "vent_imp"),
    ).toHaveLength(0);
    expect(
      director.getEvents().some((event) => event.type === "boss_windup"),
    ).toBe(false);

    director.step(windup - 1);
    expect(
      director.getUnits().filter((unit) => unit.role === "vent_imp"),
    ).toHaveLength(0);
    director.step(1);
    const imps = director.getUnits().filter((unit) => unit.role === "vent_imp");
    expect(imps).toHaveLength(4);
    expect(imps.every((unit) => unit.classId === "raider")).toBe(true);
    expect(director.isBossGateCleared()).toBe(false);
  });

  test("Orrec Vane fogs the arena after the wind-up", () => {
    const { director } = boot("bone_wastes", false);
    stepTo(director, waveAt("bone_boss"));
    const boss = director.getUnits().find((unit) => unit.role === "boss");
    if (!boss) throw new Error("Orrec did not spawn");
    const windup = secondsToWaveTicks(
      getBossDefinition("marshal_orrec_vane").windupSeconds,
    );
    director.damageUnit(boss.id, boss.hitPoints - boss.maxHitPoints * 0.5 + 1);
    expect(director.getEncounter().visionMultiplier).toBe(1);
    director.step(windup);
    expect(director.getEncounter().visionMultiplier).toBe(0.5);
    expect(director.isBossGateCleared()).toBe(false);
  });

  test("Isolde's introduction does not open the gate", () => {
    const { director, runtime } = boot("frozen_pit", false);
    stepTo(director, waveAt("pit_boss"));
    expect(director.getEvents()).toContainEqual({
      bossId: "queen_isolde",
      layerId: "frozen_pit",
      type: "boss_intro",
    });
    expect(director.requestDescend()).toEqual({
      ok: false,
      reason: "boss_gate_closed",
    });

    const boss = director.getUnits().find((unit) => unit.role === "boss");
    if (!boss) throw new Error("Isolde did not spawn");
    const windup = secondsToWaveTicks(
      getBossDefinition("queen_isolde").windupSeconds,
    );
    const speedBefore = boss.speed;
    director.damageUnit(boss.id, boss.hitPoints - boss.maxHitPoints * 0.33 + 1);
    director.step(windup);
    const advancing = director.getUnits().find((unit) => unit.role === "boss");
    expect(advancing?.speed).toBeGreaterThan(speedBefore);
    expect(director.getHazards()).toHaveLength(0);

    director.step(windup);
    expect(
      director
        .getHazards()
        .filter((hazard) => hazard.kind === "freezing_ground"),
    ).toHaveLength(3);
    expect(runtime.isBossGateCleared()).toBe(false);

    if (!advancing) throw new Error("Isolde was removed");
    kill(director, advancing.id);
    expect(director.getDrops()?.bossCoreId).toBe("boss_core");
    expect(director.requestDescend()).toEqual({ ok: true });
    expect(runtime.getActiveLayer().id).toBe("blood_sea");
  });

  test("Maw-of-Tides heals when an ally dies", () => {
    const { director } = boot("blood_sea", false);
    stepTo(director, waveAt("sea_boss"));
    const boss = director.getUnits().find((unit) => unit.role === "boss");
    const ally = director
      .getUnits()
      .find((unit) => unit.role !== "boss" && unit.waveId === boss?.waveId);
    if (!boss || !ally) throw new Error("Maw entered without an ally");
    director.damageUnit(boss.id, 200);
    const wounded = director.getUnits().find((unit) => unit.role === "boss");
    if (!wounded) throw new Error("Maw was removed");
    kill(director, ally.id);
    const healed = director.getUnits().find((unit) => unit.role === "boss");
    expect(healed?.hitPoints).toBeCloseTo(
      Math.min(
        wounded.maxHitPoints,
        wounded.hitPoints + wounded.maxHitPoints * 0.08,
      ),
    );
    expect(director.isBossGateCleared()).toBe(false);
  });

  test("the Warden of Layers rotates layer rules by phase", () => {
    const { director, runtime } = boot("throne_of_hell", false);
    stepTo(director, waveAt("throne_boss"));
    const boss = director.getUnits().find((unit) => unit.role === "boss");
    if (!boss) throw new Error("The Warden did not spawn");
    const windup = secondsToWaveTicks(
      getBossDefinition("warden_of_layers").windupSeconds,
    );
    director.damageUnit(boss.id, boss.hitPoints - boss.maxHitPoints * 0.75 + 1);
    director.step(windup);
    expect(director.getEncounter().rotatedRule).toBe("ember_vents");
    expect(
      director.getHazards().some((hazard) => hazard.kind === "ember_vent"),
    ).toBe(true);

    const mid = director.getUnits().find((unit) => unit.role === "boss");
    if (!mid) throw new Error("The Warden was removed");
    director.damageUnit(mid.id, mid.hitPoints - mid.maxHitPoints * 0.5 + 1);
    director.step(windup);
    expect(director.getEncounter().rotatedRule).toBe("fog");
    expect(director.getEncounter().visionMultiplier).toBe(0.5);
    expect(
      director.getHazards().some((hazard) => hazard.kind === "ember_vent"),
    ).toBe(false);

    const living = director.getUnits().find((unit) => unit.role === "boss");
    if (!living) throw new Error("The Warden was removed");
    kill(director, living.id);
    expect(runtime.isBossGateCleared()).toBe(true);
    expect(director.getDrops()?.bossCoreId).toBe("boss_core");
    expect(director.requestDescend()).toEqual({
      ok: false,
      reason: "final_layer",
    });
  });

  test("a fallen building does not open the gate or stop the clock", () => {
    const { director, runtime } = boot("ashen_gate", false);
    director.notifyBuildingFell("gatehouse");
    expect(runtime.isBossGateCleared()).toBe(false);
    const tick = director.tick;
    director.step(5);
    expect(director.tick).toBe(tick + 5);
    expect(director.getEvents()).toContainEqual({
      buildingId: "gatehouse",
      type: "building_fell",
    });
    stepTo(director, 90);
    expect(director.getUnits().length).toBeGreaterThan(0);
  });
});
