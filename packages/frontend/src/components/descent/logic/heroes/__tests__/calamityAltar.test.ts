import { describe, expect, test } from "bun:test";
import { TICKS_PER_SECOND } from "../../sim/constants";
import { planCalamityStrike } from "../calamityAltar";
import { createHeroCalamitySystem } from "../heroCalamitySystem";
import { createStubWorld, placeStubBuilding } from "../stubs";
import { CALAMITY_TABLE } from "../tables";
import type { HoldTier, StrikePathTile } from "../types";

const SUMMON_TICKS = 45 * TICKS_PER_SECOND;

/**
 * @param options - Altar tier, boss cores, and essence
 * @returns A stub Hold with one Calamity Altar and a bound system
 */
function setup(
  options: {
    bossCores?: number;
    essence?: number;
    tier?: HoldTier | null;
  } = {},
) {
  const world = createStubWorld({
    stockpile: { essence: options.essence ?? 2_000 },
  });
  world.items.set("boss_core", options.bossCores ?? 2);
  if (options.tier !== null) {
    placeStubBuilding(world, {
      buildingType: "calamity_altar",
      id: "altar-1",
      tier: options.tier ?? "Citadel",
    });
  }
  const system = createHeroCalamitySystem({
    ports: world.ports,
    ticksPerSecond: TICKS_PER_SECOND,
  });
  return { system, world };
}

describe("Calamity data", () => {
  test("ships the three school Calamities at 10 pop with a boss core", () => {
    expect(CALAMITY_TABLE.calamities.map((c) => [c.name, c.schoolId])).toEqual([
      ["Infernal Colossus", "ember"],
      ["Glacier Leviathan", "rime"],
      ["Blood Titan", "blood"],
    ]);
    expect(CALAMITY_TABLE.popCost).toBe(10);
    expect(CALAMITY_TABLE.calamities.every((c) => c.bossCores >= 1)).toBe(true);
  });
});

describe("summon gates", () => {
  test("passes with a Citadel Altar, a boss core, pop, and essence", () => {
    const { system } = setup();
    expect(system.canSummonCalamity("infernal_colossus")).toEqual({
      ok: true,
      reasons: [],
    });
  });

  test("fails without an Altar", () => {
    const { system } = setup({ tier: null });
    expect(system.canSummonCalamity("blood_titan").reasons).toEqual([
      "no_calamity_altar",
    ]);
  });

  test("fails below Citadel", () => {
    const { system } = setup({ tier: "Stronghold" });
    expect(system.canSummonCalamity("blood_titan").reasons).toEqual([
      "calamity_altar_tier_too_low",
    ]);
  });

  test("fails without a boss core", () => {
    const { system } = setup({ bossCores: 0 });
    expect(system.canSummonCalamity("blood_titan").reasons).toEqual([
      "missing_boss_core",
    ]);
  });

  test("fails without 10 free pop", () => {
    const { system, world } = setup();
    world.popUsed = 91;
    expect(system.canSummonCalamity("blood_titan").reasons).toEqual([
      "insufficient_pop",
    ]);
  });

  test("fails without essence", () => {
    const { system } = setup({ essence: 100 });
    expect(system.canSummonCalamity("blood_titan").reasons).toEqual([
      "insufficient_essence",
    ]);
  });

  test("reports every missing requirement at once", () => {
    const { system } = setup({ bossCores: 0, essence: 0, tier: null });
    expect(system.canSummonCalamity("glacier_leviathan").reasons).toEqual([
      "no_calamity_altar",
      "missing_boss_core",
      "insufficient_essence",
    ]);
  });

  test("a failed summon spends nothing", () => {
    const { system, world } = setup({ bossCores: 0 });
    expect(system.summonCalamity("blood_titan").ok).toBe(false);
    expect(world.stockpile.essence).toBe(2_000);
    expect(system.drainEvents()).toEqual([]);
  });
});

describe("summon channel", () => {
  test("is telegraphed, spends its cost, and puts the Calamity on the field", () => {
    const { system, world } = setup();
    const result = system.handleCommand({
      altarId: "altar-1",
      calamityId: "glacier_leviathan",
      type: "summon_calamity",
    });
    expect(result).toEqual({
      handled: true,
      result: { ok: true, reasons: [] },
    });
    expect(world.stockpile.essence).toBe(1_400);
    expect(world.items.get("boss_core")).toBe(1);
    expect(system.popUsed()).toBe(10);

    const [started] = system.drainEvents();
    expect(started).toEqual({
      altarId: "altar-1",
      calamityId: "glacier_leviathan",
      completesAtTick: SUMMON_TICKS,
      telegraph: {
        beacon: true,
        hornPitchSemitones: -7,
        hornSoundFamily: "omen",
      },
      tick: 0,
      type: "calamity_summon_started",
    });

    system.step(SUMMON_TICKS - 1);
    expect(world.spawned).toHaveLength(0);
    system.step(SUMMON_TICKS);
    expect(world.spawned[0]).toMatchObject({
      classId: "warden",
      definitionId: "glacier_leviathan",
      kind: "calamity",
      schoolId: "rime",
    });
    expect(system.drainEvents().map((e) => e.type)).toEqual([
      "calamity_summon_completed",
    ]);
  });

  test("rejects a second summon while one is channeling", () => {
    const { system } = setup();
    system.summonCalamity("blood_titan");
    expect(system.canSummonCalamity("infernal_colossus").reasons).toEqual([
      "summon_in_progress",
    ]);
  });

  test("rejects a second Calamity while one lives, and allows it after it dies", () => {
    const { system, world } = setup();
    system.summonCalamity("blood_titan");
    system.step(SUMMON_TICKS);
    expect(system.canSummonCalamity("infernal_colossus").reasons).toEqual([
      "calamity_already_active",
    ]);

    const unitId = world.spawned[0]?.unitId ?? "";
    system.onUnitKilled(unitId);
    expect(system.drainEvents().at(-1)).toMatchObject({
      calamityId: "blood_titan",
      type: "calamity_died",
      unitId,
    });
    expect(system.popUsed()).toBe(0);
    expect(system.canSummonCalamity("infernal_colossus").ok).toBe(true);
  });

  test("aborts when the Altar is destroyed mid-channel", () => {
    const { system, world } = setup();
    system.summonCalamity("infernal_colossus");
    system.step(10);
    world.buildings.delete("altar-1");
    system.step(11);
    expect(system.getState().summon).toBeNull();
    expect(system.popUsed()).toBe(0);
    system.step(SUMMON_TICKS);
    expect(world.spawned).toHaveLength(0);
    expect(system.drainEvents().map((e) => e.type)).toEqual([
      "calamity_summon_started",
      "calamity_summon_aborted",
    ]);
  });
});

describe("Infernal Colossus wall-pass", () => {
  const PATH: StrikePathTile[] = [
    { structureId: null, wall: false },
    { structureId: "wall-a", wall: true },
    { structureId: "wall-b", wall: true },
    { structureId: null, wall: false },
  ];

  /**
   * @param calamityId - Calamity to summon and strike with
   * @returns The strike result and the damage combat received
   */
  function strikeThroughWalls(calamityId: string) {
    const { system, world } = setup();
    system.summonCalamity(calamityId);
    system.step(SUMMON_TICKS);
    const result = system.calamityStrike("enemy-1", 100, PATH);
    return { damage: world.damage, result };
  }

  test("damages a target through wall tiles and burns the walls it passes", () => {
    const { damage, result } = strikeThroughWalls("infernal_colossus");
    expect(result).toEqual({
      blockedByWallId: null,
      burnedWallIds: ["wall-a", "wall-b"],
      hitTarget: true,
    });
    expect(damage.map((d) => [d.targetId, d.raw])).toEqual([
      ["wall-a", 50],
      ["wall-b", 50],
      ["enemy-1", 100],
    ]);
  });

  test("other Calamities are stopped by the first wall", () => {
    const { damage, result } = strikeThroughWalls("glacier_leviathan");
    expect(result).toEqual({
      blockedByWallId: "wall-a",
      burnedWallIds: [],
      hitTarget: false,
    });
    expect(damage.map((d) => d.targetId)).toEqual(["wall-a"]);
  });

  test("an open path hits for every Calamity", () => {
    expect(
      planCalamityStrike({}, [{ structureId: null, wall: false }]),
    ).toEqual({ blockedByWallId: null, burnedWallIds: [], hitTarget: true });
  });
});
