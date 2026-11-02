import { describe, expect, test } from "bun:test";
import { RESOURCE_IDS, type ResourceStockpile } from "../../types";
import {
  breakthroughPopDelta,
  buildingDef,
  createEconomy,
  deepWorkDef,
  type EconomyBuildingView,
  type EconomyUnit,
  economyModule,
  holdTierDef,
  listDeepWorkDefs,
  listMarketLayers,
  listResources,
  populationWeight,
} from "../index";

/**
 * @returns A stockpile large enough for placement and trade tests
 */
function richStockpile(): Partial<ResourceStockpile> {
  return {
    coin: 500,
    essence: 500,
    food: 500,
    iron: 500,
    spirit_herbs: 500,
    stone: 500,
    water: 500,
    wood: 500,
  };
}

/**
 * @param id - Unit id
 * @param x - Column
 * @param y - Row
 * @returns A villager init
 */
function villager(id: string, x: number, y: number) {
  return { id, x, y };
}

/**
 * @param buildings - Buildings from a session
 * @param x - Column
 * @param y - Row
 * @returns The building on that cell
 */
function buildingAt(
  buildings: readonly EconomyBuildingView[],
  x: number,
  y: number,
): EconomyBuildingView {
  const building = buildings.find((entry) => entry.x === x && entry.y === y);
  if (!building) throw new Error(`No building at ${x},${y}`);
  return building;
}

/**
 * @param units - Units from a session
 * @param id - Unit id
 * @returns That unit
 */
function unitById(units: readonly EconomyUnit[], id: string): EconomyUnit {
  const unit = units.find((entry) => entry.id === id);
  if (!unit) throw new Error(`No unit ${id}`);
  return unit;
}

describe("Descent economy", () => {
  test("ships eight harvested resources and the locked pop weights", () => {
    expect(listResources().map((resource) => resource.id)).toEqual([
      ...RESOURCE_IDS,
    ]);
    expect(economyModule.id).toBe("economy");
    expect(populationWeight({ popKind: "villager", realmId: null })).toBe(1);
    expect(
      populationWeight({ popKind: "soldier", realmId: "qi_gathering" }),
    ).toBe(1);
    expect(
      populationWeight({ popKind: "soldier", realmId: "foundation" }),
    ).toBe(1);
    expect(
      populationWeight({ popKind: "soldier", realmId: "core_formation" }),
    ).toBe(2);
    expect(
      populationWeight({ popKind: "soldier", realmId: "nascent_soul" }),
    ).toBe(3);
    expect(populationWeight({ popKind: "soldier", realmId: "ascension" })).toBe(
      4,
    );
    expect(populationWeight({ popKind: "hero", realmId: null })).toBe(5);
    expect(populationWeight({ popKind: "calamity", realmId: null })).toBe(10);
    expect(breakthroughPopDelta("foundation", "core_formation")).toBe(1);
    expect(listMarketLayers()).toHaveLength(5);
    const mine = deepWorkDef("deep_mine");
    expect(mine?.depths).toHaveLength(3);
    expect(mine?.shaftHead).toBe(true);
    expect(mine?.raidImmune).toBe(true);
    expect(deepWorkDef("essence_borehole")?.implemented).toBe(false);
    expect(
      listDeepWorkDefs().some((work) => work.stretch && !work.implemented),
    ).toBe(true);
  });

  test("villagers gather two node types and deposit at a drop-off", () => {
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
        {
          id: "wood-node",
          nodeType: "dead_tree",
          remaining: 40,
          resourceId: "wood",
          x: 0,
          y: 2,
        },
      ],
      units: [villager("villager-food", 1, 0), villager("villager-wood", 0, 1)],
    });

    sim.step(5);

    const stock = sim.getStockpile();
    expect(stock.food).toBeGreaterThan(0);
    expect(stock.wood).toBeGreaterThan(0);
    const food = sim.listNodes().find((node) => node.id === "food-node");
    const wood = sim.listNodes().find((node) => node.id === "wood-node");
    expect(food?.remaining).toBeLessThan(40);
    expect(wood?.remaining).toBeLessThan(40);
  });

  test("a villager holds cargo until a drop-off exists", () => {
    const sim = createEconomy({
      nodes: [
        {
          id: "food-node",
          nodeType: "fungus_grove",
          remaining: 40,
          resourceId: "food",
          x: 1,
          y: 0,
        },
      ],
      units: [villager("porter", 0, 0)],
    });

    sim.step(5);

    expect(sim.getStockpile().food).toBe(0);
    expect(unitById(sim.listUnits(), "porter").carry?.resourceId).toBe("food");
    expect(sim.listNodes()[0]?.remaining).toBeLessThan(40);
  });

  test("Barracks on a Spirit Vein gains a bonus the off-vein Barracks lacks", () => {
    const sim = createEconomy({
      stockpile: richStockpile(),
      veins: [{ id: "vein-1", x: 4, y: 4 }],
    });
    sim.enqueue({
      buildingType: "barracks",
      type: "place_building",
      x: 4,
      y: 4,
    });
    sim.enqueue({
      buildingType: "barracks",
      type: "place_building",
      x: 8,
      y: 2,
    });
    sim.step();

    const onVein = buildingAt(sim.listBuildings(), 4, 4);
    const offVein = buildingAt(sim.listBuildings(), 8, 2);
    expect(sim.isOnSpiritVein(onVein.id)).toBe(true);
    expect(sim.isOnSpiritVein(offVein.id)).toBe(false);
    expect(onVein.bonuses.vein?.id).toBe("train_speed");
    expect(offVein.bonuses.vein).toBeNull();
    expect(onVein.hp).toBeLessThan(onVein.maxHp);
    expect(onVein.constructing).toBe(true);
  });

  test("a furnace beside a Spirit Spring gains brew speed and finishes sooner", () => {
    const sim = createEconomy({
      buildings: [
        {
          buildingType: "alchemy_furnace",
          completed: true,
          id: "boosted",
          x: 5,
          y: 5,
        },
        {
          buildingType: "alchemy_furnace",
          completed: true,
          id: "plain",
          x: 12,
          y: 12,
        },
      ],
      nodes: [
        {
          id: "spring",
          nodeType: "spirit_spring",
          remaining: 80,
          resourceId: "water",
          x: 6,
          y: 5,
        },
      ],
      stockpile: richStockpile(),
      tier: "Stronghold",
    });
    sim.step();
    const boosted = buildingAt(sim.listBuildings(), 5, 5);
    const plain = buildingAt(sim.listBuildings(), 12, 12);
    expect(
      boosted.bonuses.adjacency.some(
        (flag) => flag.id === "brew_speed" && flag.amount === 0.25,
      ),
    ).toBe(true);
    expect(
      plain.bonuses.adjacency.some((flag) => flag.id === "brew_speed"),
    ).toBe(false);

    sim.enqueue({
      furnaceId: "boosted",
      pillId: "body_pill",
      type: "brew_pill",
    });
    sim.enqueue({ furnaceId: "plain", pillId: "body_pill", type: "brew_pill" });
    sim.step(7);
    expect(sim.getItemCount("body_pill")).toBe(1);
    sim.step(1);
    expect(sim.getItemCount("body_pill")).toBe(2);
  });

  test("Mess Hall rations apply a temporary fed modifier and leave others unbuffed", () => {
    const ration = buildingDef("mess_hall")?.ration;
    if (!ration) throw new Error("Mess Hall ration is missing");
    const sim = createEconomy({
      buildings: [
        { buildingType: "mess_hall", completed: true, id: "mess", x: 1, y: 1 },
      ],
      stockpile: richStockpile(),
      units: [
        {
          classId: "warden",
          id: "fed-one",
          popKind: "soldier",
          realmId: "foundation",
          x: 2,
          y: 1,
        },
        {
          classId: "hunter",
          id: "unfed",
          popKind: "soldier",
          realmId: "foundation",
          x: 3,
          y: 1,
        },
      ],
    });
    sim.enqueue({
      messHallId: "mess",
      type: "issue_rations",
      unitIds: ["fed-one"],
    });
    sim.step();

    const fed = unitById(sim.listUnits(), "fed-one").modifiers.find(
      (modifier) => modifier.id === "fed",
    );
    expect(fed?.healthBonus).toBe(0.1);
    expect(fed?.regenBonus).toBe(0.1);
    expect(unitById(sim.listUnits(), "unfed").modifiers).toEqual([]);

    sim.step(ration.windowTicks - 1);
    expect(
      unitById(sim.listUnits(), "fed-one").modifiers.some(
        (modifier) => modifier.id === "fed",
      ),
    ).toBe(true);
    sim.step(1);
    expect(unitById(sim.listUnits(), "fed-one").modifiers).toEqual([]);
  });

  test("Hell Market sells cheaper than it buys", () => {
    const sim = createEconomy({
      buildings: [
        {
          buildingType: "hell_market",
          completed: true,
          id: "market",
          x: 1,
          y: 1,
        },
      ],
      stockpile: { coin: 200, wood: 50 },
    });
    sim.enqueue({
      amount: 10,
      buy: "coin",
      sell: "wood",
      type: "market_trade",
    });
    sim.step();
    const afterSale = sim.getStockpile();
    const coinFromSale = afterSale.coin - 200;
    expect(afterSale.wood).toBe(40);
    expect(coinFromSale).toBeGreaterThan(0);

    sim.enqueue({
      amount: 10,
      buy: "wood",
      sell: "coin",
      type: "market_trade",
    });
    sim.step();
    const afterBuy = sim.getStockpile();
    const coinToBuy = afterSale.coin - afterBuy.coin;
    expect(afterBuy.wood).toBe(50);
    expect(coinToBuy).toBeGreaterThan(coinFromSale);
  });

  test("Deep Mine depth 1 yields stone, iron, and coin without touching surface nodes", () => {
    const level = deepWorkDef("deep_mine")?.depths.find(
      (depth) => depth.level === 1,
    );
    if (!level?.deposit.stone) throw new Error("Deep Mine depth 1 is missing");
    const sim = createEconomy({
      buildings: [
        { buildingType: "deep_mine", completed: true, id: "mine", x: 2, y: 2 },
      ],
      nodes: [
        {
          id: "surface-stone",
          nodeType: "rock_vein",
          remaining: 25,
          resourceId: "stone",
          x: 8,
          y: 8,
        },
      ],
      stockpile: { wood: 100 },
      tier: "Stronghold",
    });
    expect(sim.dig("mine")).toBe(true);
    sim.step(40);

    const stock = sim.getStockpile();
    const work = sim
      .listDeepWorks()
      .find((entry) => entry.kind === "deep_mine");
    expect(stock.stone).toBeGreaterThan(0);
    expect(stock.iron).toBeGreaterThan(0);
    expect(stock.coin).toBeGreaterThan(0);
    expect(work?.depth).toBeGreaterThanOrEqual(1);
    expect(work?.raidImmune).toBe(true);
    expect(work?.shaftHead).toBe(true);
    expect((work?.deposit.stone ?? 0) + stock.stone).toBe(level.deposit.stone);
    expect(sim.listNodes()[0]?.remaining).toBe(25);
    expect(sim.listNodes().some((node) => node.id === "mine")).toBe(false);

    const kept = stock.stone;
    sim.beginLayer("bone_wastes", []);
    const reset = sim
      .listDeepWorks()
      .find((entry) => entry.kind === "deep_mine");
    expect(reset?.depth).toBe(0);
    expect(reset?.deposit.stone).toBe(0);
    expect(sim.listNodes()).toEqual([]);
    expect(sim.getStockpile().stone).toBe(kept);
  });

  test("Root Cellar trickles food and water without depleting a surface node", () => {
    const sim = createEconomy({
      buildings: [
        {
          buildingType: "root_cellar",
          completed: true,
          id: "cellar",
          x: 1,
          y: 1,
        },
      ],
      nodes: [
        {
          id: "grove",
          nodeType: "fungus_grove",
          remaining: 15,
          resourceId: "food",
          x: 6,
          y: 6,
        },
      ],
    });
    sim.step(4);
    expect(sim.getStockpile().food).toBeGreaterThan(0);
    expect(sim.getStockpile().water).toBeGreaterThan(0);
    expect(sim.listNodes()[0]?.remaining).toBe(15);
    expect(sim.listDeepWorks()[0]?.raidImmune).toBe(true);
    expect(sim.listDeepWorks()[0]?.shaftHead).toBe(false);
  });

  test("destroying a volatile furnace damages neighbors and leaves distant buildings", () => {
    const splash = buildingDef("alchemy_furnace")?.volatileDamage ?? 0;
    expect(splash).toBeGreaterThan(0);
    const sim = createEconomy({
      buildings: [
        {
          buildingType: "alchemy_furnace",
          completed: true,
          hp: 10,
          id: "furnace",
          x: 2,
          y: 2,
        },
        {
          buildingType: "housing",
          completed: true,
          hp: 100,
          id: "near",
          x: 3,
          y: 2,
        },
        {
          buildingType: "housing",
          completed: true,
          hp: 100,
          id: "far",
          x: 8,
          y: 2,
        },
      ],
    });
    sim.damageBuilding("furnace", 10);
    const buildings = sim.listBuildings();
    expect(buildings.some((building) => building.id === "furnace")).toBe(false);
    expect(buildingAt(buildings, 3, 2).hp).toBe(100 - splash);
    expect(buildingAt(buildings, 8, 2).hp).toBe(100);
    expect(sim.isOnSpiritVein("furnace")).toBe(false);
  });

  test("a breakthrough pop check fails when the cap would be exceeded", () => {
    const units = Array.from({ length: 100 }, (_, index) =>
      villager(`villager-${index}`, index % 40, Math.floor(index / 40)),
    );
    const full = createEconomy({ units });
    const delta = breakthroughPopDelta("foundation", "core_formation");
    expect(full.getPopUsed()).toBe(100);
    expect(full.getPopCap()).toBe(100);
    expect(full.canAffordPop(delta)).toBe(false);
    expect(full.canAffordPop(0)).toBe(true);

    const housed = createEconomy({
      buildings: [
        { buildingType: "housing", completed: true, id: "houses", x: 0, y: 10 },
      ],
      units,
    });
    expect(housed.getPopCap()).toBe(110);
    expect(housed.canAffordPop(delta)).toBe(true);
    expect(housed.canAffordPop(11)).toBe(false);

    const withHero = createEconomy({
      units: [
        {
          classId: "warden",
          id: "hero",
          popKind: "hero",
          x: 1,
          y: 1,
        },
      ],
    });
    expect(withHero.getPopUsed()).toBe(0);
  });

  test("Camp, Stronghold, and Citadel gate which buildings can be placed", () => {
    const sim = createEconomy({ stockpile: richStockpile() });
    sim.enqueue({
      buildingType: "barracks",
      type: "place_building",
      x: 1,
      y: 1,
    });
    sim.enqueue({
      buildingType: "alchemy_furnace",
      type: "place_building",
      x: 3,
      y: 1,
    });
    sim.step();
    expect(
      sim
        .listBuildings()
        .some((building) => building.buildingType === "barracks"),
    ).toBe(true);
    expect(
      sim
        .listBuildings()
        .some((building) => building.buildingType === "alchemy_furnace"),
    ).toBe(false);

    expect(sim.upgradeHold()).toBe(true);
    sim.step((holdTierDef("Stronghold")?.upgradeTicks ?? 0) + 1);
    expect(sim.getHoldTier()).toBe("Stronghold");
    sim.enqueue({
      buildingType: "alchemy_furnace",
      type: "place_building",
      x: 3,
      y: 1,
    });
    sim.enqueue({
      buildingType: "calamity_altar",
      type: "place_building",
      x: 5,
      y: 1,
    });
    sim.step();
    expect(
      sim
        .listBuildings()
        .some((building) => building.buildingType === "alchemy_furnace"),
    ).toBe(true);
    expect(
      sim
        .listBuildings()
        .some((building) => building.buildingType === "calamity_altar"),
    ).toBe(false);

    expect(sim.upgradeHold()).toBe(true);
    sim.step((holdTierDef("Citadel")?.upgradeTicks ?? 0) + 1);
    expect(sim.getHoldTier()).toBe("Citadel");
    sim.enqueue({
      buildingType: "calamity_altar",
      type: "place_building",
      x: 5,
      y: 1,
    });
    sim.step();
    expect(
      sim
        .listBuildings()
        .some((building) => building.buildingType === "calamity_altar"),
    ).toBe(true);
  });

  test("gates let allies through a wall and stop the horde", () => {
    const walls = [0, 2, 3, 4].map((y) => ({
      buildingType: "wall",
      completed: true,
      id: `wall-${y}`,
      x: 1,
      y,
    }));
    const sim = createEconomy({
      buildings: [
        ...walls,
        { buildingType: "gate", completed: true, id: "gate", x: 1, y: 1 },
        {
          buildingType: "storehouse",
          completed: true,
          id: "store",
          x: 4,
          y: 1,
        },
      ],
      height: 5,
      nodes: [
        {
          id: "food-node",
          nodeType: "fungus_grove",
          remaining: 20,
          resourceId: "food",
          x: 3,
          y: 1,
        },
      ],
      units: [villager("runner", 0, 1)],
      width: 8,
    });
    expect(sim.isCellPassable(1, 1, "ally")).toBe(true);
    expect(sim.isCellPassable(1, 1, "horde")).toBe(false);
    expect(sim.isCellPassable(1, 0, "ally")).toBe(false);
    sim.step(20);
    expect(sim.getStockpile().food).toBeGreaterThan(0);
  });

  test("recall garrisons villagers, and release lets them gather again", () => {
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
      units: [villager("runner", 1, 0)],
    });
    sim.enqueue({ type: "recall_villagers" });
    sim.step(2);
    expect(unitById(sim.listUnits(), "runner").garrisoned).toBe(true);
    expect(sim.listNodes()[0]?.remaining).toBe(40);

    sim.releaseVillagers();
    sim.step(8);
    expect(sim.getStockpile().food).toBeGreaterThan(0);
  });

  test("trySpend is atomic and training pays food and water", () => {
    const sim = createEconomy({
      buildings: [
        {
          buildingType: "barracks",
          completed: true,
          id: "barracks",
          x: 0,
          y: 0,
        },
      ],
      stockpile: { food: 30, water: 15 },
    });
    expect(sim.trySpend({ food: 5, water: 16 })).toBe(false);
    expect(sim.getStockpile().food).toBe(30);
    expect(sim.tryPayTrainingCost("warden")).toBe(true);
    expect(sim.getStockpile()).toMatchObject({ food: 0, water: 0 });
    expect(sim.takePendingTraining()).toEqual(["warden"]);
    expect(sim.tryPayTrainingCost("warden")).toBe(false);
  });

  test("the Hell Market sells herb packs and refuses a Calamity purchase", () => {
    const sim = createEconomy({
      buildings: [
        {
          buildingType: "hell_market",
          completed: true,
          id: "market",
          x: 1,
          y: 1,
        },
      ],
      stockpile: { coin: 100 },
    });
    expect(sim.buyCoinSink("calamity")).toBe(false);
    expect(sim.buyCoinSink("herb_pack")).toBe(true);
    expect(sim.getStockpile().spirit_herbs).toBe(5);
    expect(sim.getStockpile().coin).toBe(10);
  });
});
