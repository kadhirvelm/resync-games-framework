import { describe, expect, test } from "bun:test";
import { activeVentVolumes } from "../../layers/hazards";
import type { SimWorldState } from "../../sim/world";
import { RESOURCE_IDS, type ResourceId, type UnitState } from "../../types";
import {
  asBuilding,
  buildingDef,
  compareIds,
  constructionHp,
  constructionProgressPerStep,
  createBuildingRecord,
  createEconomy,
  createEconomyMeta,
  createUnitRecord,
  damageBuilding,
  type EconomyBuilding,
  type EconomyHost,
  type EconomyUnit,
  ensureEconomyMeta,
  fedBonuses,
  holdTierDef,
  listCoinSinks,
  listMarketLayers,
  MAX_BUILDERS_PER_SITE,
  rationCost,
  resourceDef,
  runEconomyTick,
} from "../index";
import { emptyStockpile } from "../stockpile";

/** A hand-built economy world advanced one economy step at a time. */
interface TestWorld {
  host: EconomyHost;
  /** @param count - Economy steps to run */
  step(count?: number): void;
}

/**
 * Builds an empty economy host with its own step counter.
 * @param width - Map width
 * @param height - Map height
 * @returns The host and a stepper that runs `runEconomyTick`
 */
function makeWorld(width = 12, height = 12): TestWorld {
  let tick = 0;
  let layerId: string | null = "ashen_gate";
  const host: EconomyHost = {
    buildings: [],
    economy: createEconomyMeta(),
    getLayerId: () => layerId,
    getVentVolumes: () => activeVentVolumes(layerId),
    map: { height, width },
    resources: emptyStockpile(),
    setLayerId(next) {
      layerId = next;
    },
    tick: () => tick,
    units: [],
  };
  return {
    host,
    step(count = 1) {
      for (let index = 0; index < count; index += 1) {
        runEconomyTick(host);
        tick += 1;
      }
    },
  };
}

/**
 * @param host - World to search
 * @param id - Building id
 * @returns The live building record
 */
function siteById(host: EconomyHost, id: string): EconomyBuilding {
  const building = host.buildings.find((entry) => entry.id === id);
  if (!building) throw new Error(`No building ${id}`);
  return asBuilding(building);
}

/**
 * @param host - World to search
 * @param id - Unit id
 * @returns The live unit record
 */
function unitById(host: EconomyHost, id: string): EconomyUnit {
  const unit = host.units.find((entry) => entry.id === id);
  if (!unit) throw new Error(`No unit ${id}`);
  return unit as EconomyUnit;
}

describe("Descent economy placement", () => {
  test("fractional coordinates round to one cell, so a second wall cannot overlap", () => {
    const sim = createEconomy({ stockpile: { stone: 100, wood: 100 } });
    sim.enqueue({
      buildingType: "wall",
      type: "place_building",
      x: 2.4,
      y: 3.6,
    });
    sim.enqueue({
      buildingType: "wall",
      type: "place_building",
      x: 2.2,
      y: 4.4,
    });
    sim.step();
    const walls = sim.listBuildings();
    expect(walls).toHaveLength(1);
    expect(walls[0]).toMatchObject({ x: 2, y: 4 });
    expect(sim.getStockpile().wood).toBe(95);
    expect(sim.isCellPassable(2, 4, "horde")).toBe(false);
  });
});

describe("Descent economy construction", () => {
  test("a site makes no progress without an adjacent builder", () => {
    const world = makeWorld();
    world.host.buildings.push(
      createBuildingRecord({ buildingType: "housing", id: "site", x: 5, y: 5 }),
    );
    world.step(50);
    const site = siteById(world.host, "site");
    expect(site.constructing).toBe(true);
    expect(site.buildTicksDone).toBe(0);
  });

  test("one builder is slow and up to four helpers add full progress", () => {
    const world = makeWorld();
    world.host.buildings.push(
      createBuildingRecord({ buildingType: "housing", id: "site", x: 5, y: 5 }),
    );
    const cells = [
      [4, 5],
      [6, 5],
      [5, 4],
      [5, 6],
      [4, 4],
      [6, 6],
    ] as const;
    cells.forEach(([x, y], index) => {
      world.host.units.push(createUnitRecord({ id: `v-${index}`, x, y }));
    });
    world.step();
    const builders = world.host.units.filter(
      (unit) => (unit as EconomyUnit).task?.kind === "build",
    );
    expect(MAX_BUILDERS_PER_SITE).toBe(5);
    expect(builders).toHaveLength(5);
    expect(constructionProgressPerStep(1)).toBe(0.5);
    expect(constructionProgressPerStep(2)).toBe(1.5);
    expect(siteById(world.host, "site").buildTicksDone).toBe(4.5);
  });

  test("an idle villager builds a freshly placed site without micro", () => {
    const sim = createEconomy({
      stockpile: { stone: 100, wood: 100 },
      units: [{ id: "builder", x: 1, y: 1 }],
    });
    sim.enqueue({
      buildingType: "housing",
      type: "place_building",
      x: 3,
      y: 1,
    });
    const buildTicks = buildingDef("housing")?.buildTicks ?? 0;
    sim.step(Math.ceil(buildTicks / constructionProgressPerStep(1)) + 2);
    const housing = sim.listBuildings()[0];
    expect(housing?.completed).toBe(true);
    expect(sim.getPopCap()).toBe(110);
  });

  test("damage taken while building is kept through the ramp and completion", () => {
    const world = makeWorld();
    world.host.buildings.push(
      createBuildingRecord({ buildingType: "housing", id: "site", x: 5, y: 5 }),
    );
    world.host.units.push(createUnitRecord({ id: "builder", x: 4, y: 5 }));
    const site = siteById(world.host, "site");
    const floor = site.hp;
    damageBuilding(world.host, "site", 20);
    expect(site.hp).toBe(floor - 20);

    world.step(3);
    expect(site.hp).toBe(constructionHp(site, site.buildTicksDone) - 20);

    world.step(
      Math.ceil(
        (site.buildTicks - site.buildTicksDone) /
          constructionProgressPerStep(1),
      ),
    );
    expect(site.completed).toBe(true);
    expect(site.hp).toBe(site.maxHp - 20);
  });
});

describe("Descent villager orders", () => {
  test("release_villagers sends garrisoned villagers back to work", () => {
    const sim = createEconomy({
      buildings: [
        {
          buildingType: "storehouse",
          completed: true,
          id: "store",
          x: 0,
          y: 0,
        },
      ],
      nodes: [
        {
          id: "food-node",
          nodeType: "fungus_grove",
          remaining: 40,
          resourceId: "food",
          x: 2,
          y: 0,
        },
      ],
      units: [{ id: "runner", x: 1, y: 0 }],
    });
    sim.enqueue({ type: "recall_villagers" });
    sim.step(2);
    expect(sim.listUnits()[0]?.garrisoned).toBe(true);

    sim.enqueue({ type: "release_villagers" });
    sim.step((resourceDef("food")?.gatherTicks ?? 1) + 4);
    expect(sim.listUnits()[0]?.garrisoned).toBe(false);
    expect(sim.getStockpile().food).toBeGreaterThan(0);
  });

  test("a villager gives up on an unreachable node and gathers another", () => {
    const world = makeWorld(10, 6);
    const wallCells = [
      [2, 0],
      [2, 1],
      [3, 1],
      [4, 1],
      [4, 0],
    ] as const;
    for (const [x, y] of wallCells) {
      world.host.buildings.push(
        createBuildingRecord({
          buildingType: "wall",
          completed: true,
          id: `wall-${x}-${y}`,
          x,
          y,
        }),
      );
    }
    world.host.buildings.push(
      createBuildingRecord({
        buildingType: "storehouse",
        completed: true,
        id: "store",
        x: 4,
        y: 4,
      }),
    );
    world.host.economy.nodes.push(
      {
        id: "walled",
        nodeType: "fungus_grove",
        remaining: 40,
        resourceId: "food",
        x: 3,
        y: 0,
      },
      {
        id: "open",
        nodeType: "fungus_grove",
        remaining: 40,
        resourceId: "food",
        x: 0,
        y: 5,
      },
    );
    const villager = createUnitRecord({ id: "lost", x: 0, y: 0 });
    villager.preferredNodeId = "walled";
    world.host.units.push(villager);

    world.step();
    const lost = unitById(world.host, "lost");
    expect(lost.task).toBeNull();
    expect(lost.preferredNodeId).toBeNull();
    expect(lost.unreachable?.map((entry) => entry.targetId)).toEqual([
      "walled",
    ]);

    world.step();
    expect(lost.task).toMatchObject({ kind: "gather", nodeId: "open" });

    world.step((resourceDef("food")?.gatherTicks ?? 1) + 16);
    expect(world.host.resources.food).toBeGreaterThan(0);
    expect(world.host.economy.nodes[0]?.remaining).toBe(40);
  });

  test("ids order by code unit, not by locale", () => {
    expect(compareIds("a", "B")).toBeGreaterThan(0);
    expect(compareIds("B", "a")).toBeLessThan(0);
    expect(compareIds("v-1", "v-1")).toBe(0);
    expect(["b", "A", "a", "B"].sort(compareIds)).toEqual(["A", "B", "a", "b"]);
  });
});

describe("Descent adjacency bonuses", () => {
  test("an unfinished partner building grants nothing until it is finished", () => {
    const world = makeWorld();
    world.host.buildings.push(
      createBuildingRecord({
        buildingType: "barracks",
        completed: true,
        id: "barracks",
        x: 2,
        y: 2,
      }),
      createBuildingRecord({
        buildingType: "training_yard",
        id: "yard",
        x: 3,
        y: 2,
      }),
    );
    world.step();
    const barracks = siteById(world.host, "barracks");
    expect(barracks.bonuses.adjacency).toEqual([]);

    const yard = siteById(world.host, "yard");
    yard.completed = true;
    yard.constructing = false;
    world.step();
    expect(barracks.bonuses.adjacency.map((flag) => flag.id)).toEqual([
      "recruit_xp",
    ]);
  });

  test("a depleted Spirit Spring no longer speeds the furnace", () => {
    const world = makeWorld();
    world.host.economy.tier = "Stronghold";
    world.host.buildings.push(
      createBuildingRecord({
        buildingType: "alchemy_furnace",
        completed: true,
        id: "furnace",
        x: 5,
        y: 5,
      }),
    );
    world.host.economy.nodes.push({
      id: "spring",
      nodeType: "spirit_spring",
      remaining: 0,
      resourceId: "water",
      x: 6,
      y: 5,
    });
    world.step();
    expect(siteById(world.host, "furnace").bonuses.adjacency).toEqual([]);
  });
});

describe("Descent rations and fed buff", () => {
  test("each ration portion feeds five units and lasts 180 economy steps", () => {
    const ration = buildingDef("mess_hall")?.ration;
    if (!ration) throw new Error("Mess Hall ration is missing");
    expect(ration.windowTicks).toBe(180);
    expect(rationCost(ration, 5)).toEqual({ food: 10, water: 10 });
    expect(rationCost(ration, 6)).toEqual({ food: 20, water: 20 });

    const units = Array.from({ length: 6 }, (_, index) => ({
      classId: "warden" as const,
      id: `s-${index}`,
      popKind: "soldier" as const,
      realmId: "qi_gathering" as const,
      x: 3 + index,
      y: 3,
    }));
    const sim = createEconomy({
      buildings: [
        { buildingType: "mess_hall", completed: true, id: "mess", x: 1, y: 1 },
      ],
      stockpile: { food: 100, water: 100 },
      units,
    });
    sim.enqueue({
      messHallId: "mess",
      type: "issue_rations",
      unitIds: units.map((unit) => unit.id),
    });
    sim.step();
    expect(sim.getStockpile()).toMatchObject({ food: 80, water: 80 });
  });

  test("fedBonuses reads the fed modifier and is zero otherwise", () => {
    const fed = createUnitRecord({ id: "fed", x: 0, y: 0 });
    fed.modifiers.push({
      healthBonus: 0.1,
      id: "fed",
      regenBonus: 0.1,
      untilTick: 10,
    });
    const unfed = createUnitRecord({ id: "unfed", x: 0, y: 0 });
    const horde: UnitState = { classId: "raider", id: "horde", x: 0, y: 0 };
    expect(fedBonuses(fed)).toEqual({ healthBonus: 0.1, regenBonus: 0.1 });
    expect(fedBonuses(unfed)).toEqual({ healthBonus: 0, regenBonus: 0 });
    expect(fedBonuses(horde)).toEqual({ healthBonus: 0, regenBonus: 0 });
  });
});

describe("Descent market and coin sinks", () => {
  test("no coin sink sells a resource below any layer's sell price", () => {
    const resourceIds: readonly string[] = RESOURCE_IDS;
    for (const sink of listCoinSinks()) {
      if (!resourceIds.includes(sink.grants)) continue;
      const resourceId = sink.grants as ResourceId;
      const amount = sink.amount ?? 1;
      const highestSell = Math.max(
        ...listMarketLayers().map((layer) => layer.sell[resourceId] ?? 0),
      );
      expect(sink.coin / amount).toBeGreaterThanOrEqual(highestSell);
    }
  });

  test("no layer buys a resource cheaper than any layer will sell it", () => {
    const layers = listMarketLayers();
    for (const resourceId of RESOURCE_IDS) {
      const highestSell = Math.max(
        ...layers.map((layer) => layer.sell[resourceId] ?? 0),
      );
      for (const layer of layers) {
        const buy = layer.buy[resourceId];
        if (buy === undefined) continue;
        expect(buy).toBeGreaterThanOrEqual(highestSell);
      }
    }
  });

  test("mercenaries get unique ids and spawn on an open cell beside the market", () => {
    const sim = createEconomy({
      buildings: [
        {
          buildingType: "hell_market",
          completed: true,
          id: "market",
          x: 2,
          y: 2,
        },
        { buildingType: "wall", completed: true, id: "wall-a", x: 5, y: 0 },
        { buildingType: "wall", completed: true, id: "wall-b", x: 5, y: 1 },
      ],
      stockpile: { coin: 200 },
      units: [{ id: "mercenary-1", x: 5, y: 5 }],
    });
    expect(sim.buyCoinSink("mercenary_ashborn")).toBe(true);
    expect(sim.buyCoinSink("mercenary_ashborn")).toBe(true);
    const hires = sim
      .listUnits()
      .filter((unit) => unit.classId === "warden")
      .map((unit) => ({ id: unit.id, x: unit.x, y: unit.y }));
    expect(hires).toEqual([
      { id: "mercenary-2", x: 5, y: 2 },
      { id: "mercenary-3", x: 5, y: 2 },
    ]);
  });
});

describe("Descent hold tiers", () => {
  test("tier upgrades take 10 and 15 seconds at two steps per second", () => {
    expect(holdTierDef("Stronghold")?.upgradeTicks).toBe(20);
    expect(holdTierDef("Citadel")?.upgradeTicks).toBe(30);
  });
});

describe("Descent economy saves", () => {
  test("a new world gets an empty Camp", () => {
    const world = { meta: {} } as unknown as SimWorldState;
    expect(ensureEconomyMeta(world)).toEqual(createEconomyMeta());
  });

  test("a partial save keeps its valid fields and fills the rest", () => {
    const saved = {
      items: "junk",
      nodes: [
        {
          id: "grove",
          nodeType: "fungus_grove",
          remaining: 12,
          resourceId: "food",
          x: 3,
          y: 4,
        },
        { id: "broken" },
      ],
      popReserved: 2,
      tier: "Stronghold",
      upgrade: { startedTick: 4, target: "Citadel", ticksLeft: 9 },
    };
    const world = { meta: { economy: saved } } as unknown as SimWorldState;
    const meta = ensureEconomyMeta(world);
    expect(meta).toBe(saved as unknown as typeof meta);
    expect(meta.tier).toBe("Stronghold");
    expect(meta.nodes.map((node) => node.id)).toEqual(["grove"]);
    expect(meta.popReserved).toBe(2);
    expect(meta.upgrade).toEqual({
      startedTick: 4,
      target: "Citadel",
      ticksLeft: 9,
    });
    expect(meta.items).toEqual({});
    expect(meta.veins).toEqual([]);
    expect(meta.works).toEqual([]);
    expect(meta.pendingTraining).toEqual([]);
    expect(meta.mercenarySerial).toBe(0);
    expect(meta.rejection).toBeNull();
  });

  test("a save with a bad tier keeps its nodes and falls back to Camp", () => {
    const world = {
      meta: { economy: { nodes: [], tier: "Palace", works: [] } },
    } as unknown as SimWorldState;
    expect(ensureEconomyMeta(world).tier).toBe("Camp");
  });
});
