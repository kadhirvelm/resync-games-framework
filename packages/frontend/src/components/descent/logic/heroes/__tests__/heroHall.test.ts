import { describe, expect, test } from "bun:test";
import { TICKS_PER_SECOND } from "../../sim/constants";
import { createHeroCalamitySystem } from "../heroCalamitySystem";
import { createStubWorld, placeStubBuilding, type StubWorld } from "../stubs";
import { HERO_TABLE } from "../tables";
import type { HoldTier } from "../types";

const EDDA_TRAIN_TICKS = 40 * TICKS_PER_SECOND;

/**
 * @param options - Hall tier, cap, and stockpile overrides
 * @returns A stub Hold with one Hero Hall and a bound system
 */
function setup(
  options: { aliveHeroCap?: number; essence?: number; tier?: HoldTier } = {},
) {
  const world = createStubWorld({
    stockpile: {
      coin: 10_000,
      essence: options.essence ?? 10_000,
      food: 10_000,
      iron: 10_000,
      spirit_herbs: 100,
    },
  });
  placeStubBuilding(world, {
    buildingType: "hero_hall",
    id: "hall-1",
    tier: options.tier ?? "Stronghold",
  });
  const system = createHeroCalamitySystem({
    aliveHeroCap: options.aliveHeroCap,
    ports: world.ports,
    ticksPerSecond: TICKS_PER_SECOND,
  });
  return { system, world };
}

/**
 * Trains a hero to completion.
 *
 * @param system - Bound system
 * @param heroId - Hero to train
 * @param fromTick - Tick training starts on
 * @returns Tick the hero came out
 */
function trainToField(
  system: ReturnType<typeof createHeroCalamitySystem>,
  heroId: string,
  fromTick: number,
): number {
  system.step(fromTick);
  expect(system.trainHero(heroId, "hall-1").ok).toBe(true);
  const seconds =
    HERO_TABLE.heroes.find((h) => h.id === heroId)?.trainSeconds ?? 0;
  const doneTick = fromTick + seconds * TICKS_PER_SECOND;
  system.step(doneTick);
  return doneTick;
}

/**
 * @param world - Stub world
 * @param heroId - Hero whose spawned unit to find
 * @returns The hero's unit id
 */
function heroUnit(world: StubWorld, heroId: string): string {
  const spawn = world.spawned.find((s) => s.definitionId === heroId);
  if (!spawn) {
    throw new Error(`${heroId} never spawned`);
  }
  return spawn.unitId;
}

describe("hero data", () => {
  test("ships the four MVP heroes with data-only ultimates", () => {
    expect(HERO_TABLE.heroes.map((h) => h.name)).toEqual([
      "Edda Kesh",
      "Brother Tamsin Roe",
      "Sera Quill",
      "Ilya the Unnamed",
    ]);
    expect(HERO_TABLE.heroes.every((h) => h.ultimate.executes === false)).toBe(
      true,
    );
    expect(HERO_TABLE.popCost).toBe(5);
    expect(HERO_TABLE.treasureSlots).toBe(3);
  });

  test("Ilya starts locked and the named three start available", () => {
    const { system } = setup();
    const statuses = Object.fromEntries(
      system.listHeroes().map((h) => [h.heroId, h.status]),
    );
    expect(statuses).toEqual({
      edda_kesh: "available",
      ilya_unnamed: "locked",
      sera_quill: "available",
      tamsin_roe: "available",
    });
    expect(system.trainHero("ilya_unnamed", "hall-1").reasons).toContain(
      "hero_locked",
    );
  });
});

describe("Hero Hall training", () => {
  test("needs a Stronghold Hall", () => {
    const { system } = setup({ tier: "Camp" });
    expect(system.canTrainHero("edda_kesh", "hall-1").reasons).toContain(
      "hero_hall_tier_too_low",
    );
  });

  test("trains a hero with pop, school, three treasure slots, and a lit lantern", () => {
    const { system, world } = setup();
    trainToField(system, "edda_kesh", 0);
    const edda = system.listHeroes().find((h) => h.heroId === "edda_kesh");
    expect(edda?.status).toBe("alive");
    expect(edda?.lanternLit).toBe(true);
    expect(system.popUsed()).toBe(5);
    const unitId = heroUnit(world, "edda_kesh");
    expect(world.cultivators.get(unitId)).toEqual({
      realmId: "qi_gathering",
      schoolId: "ember",
      treasureSlots: 3,
    });
    expect(system.drainEvents().map((e) => e.type)).toEqual([
      "hero_training_started",
      "hero_trained",
    ]);
  });

  test("rejects a fourth living hero when the cap is 3", () => {
    const { system } = setup();
    system.unlockHero("ilya_unnamed");
    let tick = 0;
    for (const heroId of ["edda_kesh", "tamsin_roe", "sera_quill"]) {
      tick = trainToField(system, heroId, tick);
    }
    const fourth = system.trainHero("ilya_unnamed", "hall-1");
    expect(fourth.ok).toBe(false);
    expect(fourth.reasons).toContain("hero_cap_reached");
  });

  test("counts heroes still in training against the cap", () => {
    const { system } = setup({ aliveHeroCap: 1 });
    expect(system.trainHero("edda_kesh", "hall-1").ok).toBe(true);
    expect(system.trainHero("sera_quill", "hall-1").reasons).toContain(
      "hero_cap_reached",
    );
  });

  test("keeps the cap configurable", () => {
    const { system } = setup({ aliveHeroCap: 4 });
    system.unlockHero("ilya_unnamed");
    let tick = 0;
    for (const heroId of ["edda_kesh", "tamsin_roe", "sera_quill"]) {
      tick = trainToField(system, heroId, tick);
    }
    expect(system.trainHero("ilya_unnamed", "hall-1").ok).toBe(true);
  });

  test("rejects training without pop", () => {
    const { system, world } = setup();
    world.popUsed = 97;
    expect(system.trainHero("edda_kesh", "hall-1").reasons).toContain(
      "insufficient_pop",
    );
  });
});

describe("death and revive", () => {
  test("a fallen hero cannot act until the revive finishes, and revive spends essence", () => {
    const { system, world } = setup({ essence: 1_000 });
    const trainedAt = trainToField(system, "sera_quill", 0);
    const unitId = heroUnit(world, "sera_quill");
    system.drainEvents();
    const essenceBeforeDeath = world.stockpile.essence;

    system.onUnitKilled(unitId);
    expect(system.canHeroAct("sera_quill")).toBe(false);
    expect(system.popUsed()).toBe(0);
    const fallen = system.listHeroes().find((h) => h.heroId === "sera_quill");
    expect(fallen?.status).toBe("awaiting_revive");
    expect(fallen?.lanternLit).toBe(false);

    const cost = system.reviveCost("sera_quill");
    expect(system.startRevive("sera_quill").ok).toBe(true);
    expect(world.stockpile.essence).toBe(essenceBeforeDeath - cost.essence);
    expect(system.canHeroAct("sera_quill")).toBe(false);

    system.step(trainedAt + cost.ticks - 1);
    expect(system.canHeroAct("sera_quill")).toBe(false);
    system.step(trainedAt + cost.ticks);
    expect(system.canHeroAct("sera_quill")).toBe(true);
    expect(world.revived).toEqual([{ buildingId: "hall-1", unitId }]);
    expect(system.drainEvents().map((e) => e.type)).toEqual([
      "hero_fallen",
      "hero_revive_started",
      "hero_revived",
    ]);
  });

  test("revive costs more essence and time at higher realms", () => {
    const { system, world } = setup();
    trainToField(system, "edda_kesh", 0);
    const unitId = heroUnit(world, "edda_kesh");
    system.onUnitKilled(unitId);
    const ashborn = system.reviveCost("edda_kesh");
    const cultivator = world.cultivators.get(unitId);
    if (cultivator) {
      cultivator.realmId = "core_formation";
    }
    const veteran = system.reviveCost("edda_kesh");
    expect(veteran.essence).toBeGreaterThan(ashborn.essence);
    expect(veteran.ticks).toBeGreaterThan(ashborn.ticks);
  });

  test("revive fails without essence and leaves the hero fallen", () => {
    const { system, world } = setup();
    trainToField(system, "edda_kesh", 0);
    system.onUnitKilled(heroUnit(world, "edda_kesh"));
    world.stockpile.essence = 0;
    const result = system.startRevive("edda_kesh");
    expect(result.reasons).toContain("insufficient_essence");
    expect(system.listHeroes()[0]?.status).toBe("awaiting_revive");
  });

  test("a living hero cannot be revived", () => {
    const { system } = setup();
    trainToField(system, "edda_kesh", 0);
    expect(system.startRevive("edda_kesh").reasons).toContain(
      "hero_not_fallen",
    );
  });

  test("revive is blocked while three other heroes hold the cap", () => {
    const { system, world } = setup();
    system.unlockHero("ilya_unnamed");
    let tick = trainToField(system, "edda_kesh", 0);
    system.onUnitKilled(heroUnit(world, "edda_kesh"));
    for (const heroId of ["tamsin_roe", "sera_quill", "ilya_unnamed"]) {
      tick = trainToField(system, heroId, tick);
    }
    expect(system.startRevive("edda_kesh").reasons).toContain(
      "hero_cap_reached",
    );
  });

  test("losing the Hall mid-revive interrupts it", () => {
    const { system, world } = setup();
    const tick = trainToField(system, "edda_kesh", 0);
    system.onUnitKilled(heroUnit(world, "edda_kesh"));
    system.startRevive("edda_kesh");
    world.buildings.delete("hall-1");
    system.step(tick + 1);
    expect(system.listHeroes()[0]?.status).toBe("awaiting_revive");
    expect(system.drainEvents().at(-1)?.type).toBe("hero_channel_interrupted");
  });
});

describe("Ilya's school", () => {
  test("Ilya picks a school only at Sworn, and only once", () => {
    const { system, world } = setup();
    system.unlockHero("ilya_unnamed");
    trainToField(system, "ilya_unnamed", 0);
    const unitId = heroUnit(world, "ilya_unnamed");
    const command = {
      school: "rime",
      type: "choose_school",
      unitId,
    } as const;
    expect(system.handleCommand(command).result.reasons).toEqual([
      "below_sworn",
    ]);
    const cultivator = world.cultivators.get(unitId);
    if (cultivator) {
      cultivator.realmId = "foundation";
    }
    expect(system.handleCommand(command)).toEqual({
      handled: true,
      result: { ok: true, reasons: [] },
    });
    expect(world.cultivators.get(unitId)?.schoolId).toBe("rime");
    expect(system.chooseHeroSchool("ilya_unnamed", "blood").reasons).toEqual([
      "school_locked",
    ]);
  });

  test("named heroes cannot change their preset school", () => {
    const { system } = setup();
    trainToField(system, "edda_kesh", 0);
    expect(system.chooseHeroSchool("edda_kesh", "rime").reasons).toEqual([
      "school_locked",
    ]);
  });

  test("leaves choose_school for non-hero units to cultivation", () => {
    const { system } = setup();
    const outcome = system.handleCommand({
      school: "ember",
      type: "choose_school",
      unitId: "soldier-1",
    });
    expect(outcome.handled).toBe(false);
  });
});

describe("determinism and saves", () => {
  test("restoring saved state continues the same channel", () => {
    const { system, world } = setup();
    system.trainHero("edda_kesh", "hall-1");
    const saved = JSON.parse(JSON.stringify(system.getState()));
    const restored = createHeroCalamitySystem({
      ports: world.ports,
      state: saved,
    });
    restored.step(EDDA_TRAIN_TICKS);
    expect(restored.canHeroAct("edda_kesh")).toBe(true);
  });
});
