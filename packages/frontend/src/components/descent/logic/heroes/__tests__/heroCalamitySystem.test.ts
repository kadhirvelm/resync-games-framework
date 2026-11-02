import { describe, expect, test } from "bun:test";
import calamitiesJson from "../../../data/calamities.json";
import { TICKS_PER_SECOND } from "../../sim/constants";
import { createHeroCalamitySystem } from "../heroCalamitySystem";
import { createStubWorld, placeStubBuilding } from "../stubs";
import { CALAMITY_TABLE, HERO_TABLE } from "../tables";

/**
 * Builds a stub Hold with a Hero Hall and plenty of resources.
 * @returns The stub world
 */
function stubHold() {
  const world = createStubWorld({
    stockpile: {
      coin: 10_000,
      essence: 10_000,
      food: 10_000,
      iron: 10_000,
      spirit_herbs: 100,
    },
  });
  placeStubBuilding(world, {
    buildingType: "hero_hall",
    id: "hall-1",
    tier: "Stronghold",
  });
  return world;
}

describe("sim clock", () => {
  test("defaults to the Descent sim's ticks per second", () => {
    const system = createHeroCalamitySystem({ ports: stubHold().ports });

    expect(system.getState().ticksPerSecond).toBe(TICKS_PER_SECOND);
  });

  test("trains a hero over its listed seconds of sim time", () => {
    const system = createHeroCalamitySystem({ ports: stubHold().ports });
    const trainSeconds =
      HERO_TABLE.heroes.find((hero) => hero.id === "edda_kesh")?.trainSeconds ??
      0;

    expect(system.trainHero("edda_kesh", "hall-1").ok).toBe(true);
    system.step(trainSeconds * TICKS_PER_SECOND - 1);
    expect(system.canHeroAct("edda_kesh")).toBe(false);
    system.step(trainSeconds * TICKS_PER_SECOND);
    expect(system.canHeroAct("edda_kesh")).toBe(true);
  });

  test("a restored save adopts the live sim rate", () => {
    const world = stubHold();
    const original = createHeroCalamitySystem({
      ports: world.ports,
      ticksPerSecond: 10,
    });
    const saved = JSON.parse(JSON.stringify(original.getState()));

    const restored = createHeroCalamitySystem({
      ports: world.ports,
      state: saved,
    });

    expect(restored.getState().ticksPerSecond).toBe(TICKS_PER_SECOND);
  });
});

describe("Calamity Altar cost", () => {
  test("consumes the shared boss_core item", () => {
    expect(calamitiesJson.bossCoreItemId).toBe("boss_core");
    expect(CALAMITY_TABLE.bossCoreItemId).toBe("boss_core");
  });
});
