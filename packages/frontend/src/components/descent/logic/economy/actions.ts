/**
 * Player and sibling-chunk actions. Command handlers call these during a tick.
 * Spend, damage, dig, and upgrade are also safe to call between ticks from a
 * processor in another chunk.
 */

import type { ClassId, ResourceId, ResourceStockpile } from "../types";
import { recomputeBonuses } from "./bonuses";
import {
  footprintCells,
  footprintCovers,
  footprintDistance,
  footprintGap,
} from "./footprint";
import type {
  EconomyBuilding,
  EconomyHost,
  Point,
  ResourceNode,
  SpiritVein,
} from "./model";
import { SOLDIER_POP } from "./pop";
import { canAffordPop } from "./queries";
import {
  asBuilding,
  asUnit,
  createBuildingRecord,
  createUnitRecord,
  findBuilding,
  findCompletedByType,
  isEconomyUnit,
  nextHoldTier,
  tierAllows,
} from "./records";
import { trySpend } from "./stockpile";
import {
  buildingDef,
  coinSinkDef,
  holdTierDef,
  marketRates,
  pillRecipe,
  type RationDef,
  trainingCost,
} from "./tables";
import { cellOpenToAlly } from "./villagers";
import { resetWorks } from "./works";

/**
 * Places a building when the tier, ground, and cost all allow it. The
 * request names the center cell; the whole square must be on the map and
 * clear of other buildings and surface nodes. Units standing on the square
 * step off to the nearest open cell.
 * @param host - World that gains the site
 * @param request - Building type and center cell
 * @param id - Stable id from the sim
 * @returns A player-readable rejection, or null when the site was placed
 */
export function placeBuilding(
  host: EconomyHost,
  request: { buildingType: string; x: number; y: number },
  id: string,
): string | null {
  const x = Math.round(request.x);
  const y = Math.round(request.y);
  const def = buildingDef(request.buildingType);
  if (!def) return "That building is not in the Hold's plans.";
  if (!tierAllows(host.economy.tier, def.tier)) {
    return `${def.name} needs a ${def.tier}.`;
  }
  const site = { buildingType: def.id, x, y };
  const cells = footprintCells(site);
  if (!cells.every((cell) => inBounds(host, cell.x, cell.y))) {
    return `${def.name} does not fit on the map there.`;
  }
  if (occupied(host, site)) return "That ground is already taken.";
  if (!trySpend(host, def.cost)) {
    return `Need ${costPhrase(def.cost)} to place ${def.name}.`;
  }
  host.buildings.push(createBuildingRecord({ ...site, id }));
  clearFootprint(host, site);
  return null;
}

/**
 * Moves every living unit off a new building's square so nobody is walled in.
 * @param host - World whose units may move
 * @param site - Building that was just placed
 */
function clearFootprint(
  host: EconomyHost,
  site: { buildingType: string; x: number; y: number },
): void {
  for (const unit of host.units) {
    if (!isEconomyUnit(unit) || unit.garrisoned) continue;
    const cell = { x: Math.round(unit.x), y: Math.round(unit.y) };
    if (!footprintCovers(site, cell.x, cell.y)) continue;
    const open = nearestOpenCell(host, cell);
    if (!open) continue;
    unit.x = open.x;
    unit.y = open.y;
  }
}

/**
 * Sells `amount` of one resource and buys another at the layer's rates.
 * Buying costs more coin than selling the same goods paid.
 * @param host - World whose stockpile and market change
 * @param sell - Resource leaving the stockpile. Coin buys the other resource.
 * @param buy - Resource entering the stockpile. Coin means a straight sale.
 * @param amount - Units of `sell` to convert, or units of `buy` when selling coin
 * @returns Whether the trade happened
 */
export function trade(
  host: EconomyHost,
  sell: ResourceId,
  buy: ResourceId,
  amount: number,
): boolean {
  if (sell === buy) return false;
  if (!Number.isInteger(amount) || amount <= 0) return false;
  if (!findCompletedByType(host, "hell_market")) return false;
  const rates = marketRates(host.getLayerId());
  if (sell === "coin") return buyGoods(host, buy, amount, rates.buy[buy]);
  if (buy === "coin") return sellGoods(host, sell, amount, rates.sell[sell]);
  return convertGoods(host, sell, buy, amount, rates);
}

/**
 * Food and water to feed a group. One ration portion feeds
 * `ration.unitsPerRation` units, so the cost grows with the group.
 * @param ration - Mess Hall ration row
 * @param unitCount - Living units being fed
 * @returns `ceil(unitCount / unitsPerRation)` portions of food and water
 */
export function rationCost(
  ration: RationDef,
  unitCount: number,
): Partial<ResourceStockpile> {
  const perPortion = Math.max(1, ration.unitsPerRation);
  const portions = Math.ceil(Math.max(0, unitCount) / perPortion);
  return { food: ration.food * portions, water: ration.water * portions };
}

/**
 * Spends food and water at a Mess Hall and marks the listed units fed.
 * Each portion feeds `unitsPerRation` units (see `rationCost`).
 * Units left off the list stay unbuffed. Nobody is penalized for missing rations.
 * @param host - World whose stockpile and units change
 * @param messHallId - Completed Mess Hall
 * @param unitIds - Units receiving the ration
 * @returns Whether the ration was issued
 */
export function issueRations(
  host: EconomyHost,
  messHallId: string,
  unitIds: readonly string[],
): boolean {
  const hall = findBuilding(host, messHallId);
  if (!hall?.completed || hall.buildingType !== "mess_hall") return false;
  const ration = buildingDef("mess_hall")?.ration;
  if (!ration) return false;
  const targets = host.units.filter(
    (unit) => isEconomyUnit(unit) && unitIds.includes(unit.id) && unit.hp > 0,
  );
  if (targets.length === 0) return false;
  if (!trySpend(host, rationCost(ration, targets.length))) return false;
  for (const unit of targets) {
    const record = asUnit(unit);
    record.modifiers = record.modifiers.filter(
      (modifier) => modifier.id !== "fed",
    );
    record.modifiers.push({
      healthBonus: ration.healthBonus,
      id: "fed",
      regenBonus: ration.regenBonus,
      untilTick: host.tick() + ration.windowTicks,
    });
  }
  return true;
}

/**
 * Starts one brew when the furnace is free and the ingredients are on hand.
 * @param host - World whose stockpile and furnace change
 * @param furnaceId - Completed Alchemy Furnace
 * @param pillId - Recipe id
 * @returns Whether the batch started
 */
export function startBrew(
  host: EconomyHost,
  furnaceId: string,
  pillId: string,
): boolean {
  const furnace = findBuilding(host, furnaceId);
  if (!furnace?.completed || furnace.buildingType !== "alchemy_furnace")
    return false;
  if (furnace.brew) return false;
  const recipe = pillRecipe(pillId);
  if (!recipe) return false;
  if (!trySpend(host, recipe.ingredients)) return false;
  furnace.brew = { pillId, progress: 0, required: recipe.brewTicks };
  return true;
}

/**
 * Advances every furnace. A Spirit Spring neighbor brews faster.
 * @param host - World whose furnaces and pill stocks change
 */
export function stepBrewing(host: EconomyHost): void {
  for (const building of host.buildings) {
    const furnace = asBuilding(building);
    if (!furnace.brew) continue;
    furnace.brew.progress += brewSpeed(furnace);
    if (furnace.brew.progress < furnace.brew.required) continue;
    const count = host.economy.items[furnace.brew.pillId] ?? 0;
    host.economy.items[furnace.brew.pillId] = count + 1;
    furnace.brew = null;
  }
}

/**
 * Pays for the next hold tier and starts its timer.
 * @param host - World whose tier will change after the timer
 * @returns Whether the upgrade started
 */
export function upgradeHold(host: EconomyHost): boolean {
  if (host.economy.upgrade) return false;
  const target = nextHoldTier(host.economy.tier);
  if (!target) return false;
  const def = holdTierDef(target);
  if (!def) return false;
  if (!trySpend(host, def.upgradeCost)) return false;
  host.economy.upgrade = {
    startedTick: host.tick(),
    target,
    ticksLeft: def.upgradeTicks,
  };
  return true;
}

/**
 * Finishes a tier upgrade that was started on an earlier tick.
 * @param host - World whose tier may advance
 */
export function advanceUpgrade(host: EconomyHost): void {
  const upgrade = host.economy.upgrade;
  if (!upgrade) return;
  if (upgrade.startedTick === host.tick()) return;
  upgrade.ticksLeft -= 1;
  if (upgrade.ticksLeft > 0) return;
  host.economy.tier = upgrade.target;
  host.economy.upgrade = null;
}

/**
 * Damages a building. A furnace that falls to zero also damages neighbors.
 * @param host - World whose buildings and units can be hurt
 * @param buildingId - Building taking the hit
 * @param amount - Damage to apply
 */
export function damageBuilding(
  host: EconomyHost,
  buildingId: string,
  amount: number,
): void {
  applyDamage(host, buildingId, amount);
  recomputeBonuses(host);
}

/**
 * Replaces surface nodes and wipes underground deposits.
 * Stockpiled resources stay. The new layer does not inherit the old ground.
 * @param host - World whose ground is replaced
 * @param layerId - Layer now being played
 * @param nodes - Fresh surface nodes
 * @param veins - Fresh veins, or the current veins when omitted
 */
export function beginLayer(
  host: EconomyHost,
  layerId: string,
  nodes: readonly ResourceNode[],
  veins?: readonly SpiritVein[],
): void {
  host.setLayerId(layerId);
  host.economy.nodes = nodes.map((node) => ({ ...node }));
  if (veins) host.economy.veins = veins.map((vein) => ({ ...vein }));
  resetWorks(host);
  recomputeBonuses(host);
}

/**
 * Spends a class's food and water when a Barracks is up and pop has room.
 * The caller spawns the unit in the same tick; this only pays and records it.
 * @param host - World whose stockpile changes
 * @param classId - Class to train
 * @returns Whether the cost was paid
 */
export function payTraining(host: EconomyHost, classId: ClassId): boolean {
  if (!findCompletedByType(host, "barracks")) return false;
  const cost = trainingCost(classId);
  if (!cost) return false;
  const pop = classId === "villager" ? 1 : SOLDIER_POP.qi_gathering;
  if (!canAffordPop(host, pop)) return false;
  if (!trySpend(host, cost)) return false;
  host.economy.pendingTraining.push(classId);
  return true;
}

/**
 * Buys a mercenary, a treasure blank, or an herb pack. Calamity is refused.
 * @param host - World whose coin and grants change
 * @param sinkId - Coin sink id
 * @returns Whether the purchase happened
 */
export function buyCoinSink(host: EconomyHost, sinkId: string): boolean {
  const sink = coinSinkDef(sinkId);
  if (!sink) return false;
  if (!findCompletedByType(host, "hell_market")) return false;
  if (sink.grants === "ashborn_soldier") return buyMercenary(host, sink.coin);
  if (!trySpend(host, { coin: sink.coin })) return false;
  if (sink.grants === "spirit_herbs") {
    host.resources.spirit_herbs =
      (host.resources.spirit_herbs ?? 0) + (sink.amount ?? 0);
    return true;
  }
  const owned = host.economy.items[sink.grants] ?? 0;
  host.economy.items[sink.grants] = owned + 1;
  return true;
}

/**
 * Formats a sparse cost for a placement rejection.
 * @param cost - Amounts the building requires
 * @returns A short resource list
 */
function costPhrase(cost: Partial<ResourceStockpile>): string {
  const parts = Object.entries(cost)
    .filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0)
    .map(([resourceId, amount]) => `${resourceId} ${amount}`);
  if (parts.length === 0) return "nothing";
  return parts.join(", ");
}

/**
 * @param host - World to test
 * @param x - Cell column
 * @param y - Cell row
 * @returns Whether a building may occupy the cell
 */
function inBounds(host: EconomyHost, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < host.map.width && y < host.map.height;
}

/**
 * @param host - World of footprints and nodes
 * @param site - Proposed building and its center cell
 * @returns Whether another building's square or a surface node overlaps it
 */
function occupied(
  host: EconomyHost,
  site: { buildingType: string; x: number; y: number },
): boolean {
  if (host.buildings.some((building) => footprintGap(building, site) === 0))
    return true;
  return host.economy.nodes.some((node) =>
    footprintCovers(site, node.x, node.y),
  );
}

/**
 * @param host - World paying coin
 * @param resourceId - Resource to add
 * @param amount - Units to add
 * @param price - Coin per unit
 * @returns Whether the purchase happened
 */
function buyGoods(
  host: EconomyHost,
  resourceId: ResourceId,
  amount: number,
  price: number | undefined,
): boolean {
  if (price === undefined) return false;
  if (!trySpend(host, { coin: amount * price })) return false;
  host.resources[resourceId] = (host.resources[resourceId] ?? 0) + amount;
  return true;
}

/**
 * @param host - World receiving coin
 * @param resourceId - Resource to remove
 * @param amount - Units to remove
 * @param price - Coin per unit
 * @returns Whether the sale happened
 */
function sellGoods(
  host: EconomyHost,
  resourceId: ResourceId,
  amount: number,
  price: number | undefined,
): boolean {
  if (price === undefined) return false;
  const cost = { [resourceId]: amount } as Partial<ResourceStockpile>;
  if (!trySpend(host, cost)) return false;
  host.resources.coin = (host.resources.coin ?? 0) + amount * price;
  return true;
}

/**
 * Sells one good and spends the proceeds on another. Leftover coin stays.
 * @param host - World being traded
 * @param sell - Resource sold
 * @param buy - Resource bought
 * @param amount - Units sold
 * @param rates - Layer price table
 * @returns Whether the conversion happened
 */
function convertGoods(
  host: EconomyHost,
  sell: ResourceId,
  buy: ResourceId,
  amount: number,
  rates: ReturnType<typeof marketRates>,
): boolean {
  const sellPrice = rates.sell[sell];
  const buyPrice = rates.buy[buy];
  if (sellPrice === undefined || buyPrice === undefined || buyPrice <= 0)
    return false;
  const cost = { [sell]: amount } as Partial<ResourceStockpile>;
  if (!trySpend(host, cost)) return false;
  const proceeds = amount * sellPrice;
  const bought = Math.floor(proceeds / buyPrice);
  host.resources[buy] = (host.resources[buy] ?? 0) + bought;
  host.resources.coin =
    (host.resources.coin ?? 0) + (proceeds - bought * buyPrice);
  return true;
}

/**
 * @param furnace - Furnace whose neighbors may include a Spirit Spring
 * @returns 1, plus the brew-speed bonus when the spring is adjacent
 */
function brewSpeed(furnace: EconomyBuilding): number {
  const bonus = furnace.bonuses.adjacency.find(
    (flag) => flag.id === "brew_speed",
  );
  if (!bonus) return 1;
  return 1 + bonus.amount;
}

/**
 * Applies damage and, when a volatile building dies, splashes its neighbors.
 * @param host - World being damaged
 * @param buildingId - Building taking the hit
 * @param amount - Damage to apply
 */
function applyDamage(
  host: EconomyHost,
  buildingId: string,
  amount: number,
): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const building = findBuilding(host, buildingId);
  if (!building) return;
  building.hp -= amount;
  if (building.hp > 0) return;
  destroyBuilding(host, building);
}

/**
 * Removes a building and splashes volatile damage onto adjacent victims.
 * @param host - World losing the building
 * @param building - Building that reached zero health
 */
function destroyBuilding(host: EconomyHost, building: EconomyBuilding): void {
  const index = host.buildings.findIndex((entry) => entry.id === building.id);
  if (index < 0) return;
  const splash = buildingDef(building.buildingType)?.volatileDamage ?? 0;
  host.buildings.splice(index, 1);
  host.economy.works = host.economy.works.filter(
    (work) => work.buildingId !== building.id,
  );
  if (splash <= 0) return;
  const victims = host.buildings.filter(
    (other) => footprintGap(other, building) <= 1,
  );
  for (const victim of victims) applyDamage(host, victim.id, splash);
  for (const unit of [...host.units]) {
    if (!isEconomyUnit(unit)) continue;
    if (footprintDistance(building, unit) > 1) continue;
    const record = asUnit(unit);
    record.hp -= splash;
    if (record.hp > 0) continue;
    const unitIndex = host.units.findIndex((entry) => entry.id === unit.id);
    if (unitIndex < 0) continue;
    host.units.splice(unitIndex, 1);
  }
}

/**
 * Spends coin and adds one Ashborn soldier when pop allows it. The soldier
 * appears on the nearest open cell around the market, and its id comes from
 * a serial saved in economy meta so hires never collide.
 * @param host - World gaining a mercenary
 * @param coin - Price
 * @returns Whether the mercenary was hired
 */
function buyMercenary(host: EconomyHost, coin: number): boolean {
  if (!canAffordPop(host, SOLDIER_POP.qi_gathering)) return false;
  const market = findCompletedByType(host, "hell_market");
  if (!market) return false;
  const cell = nearestOpenCell(host, market);
  if (!cell) return false;
  if (!trySpend(host, { coin })) return false;
  host.units.push(
    createUnitRecord({
      classId: "warden",
      id: nextMercenaryId(host),
      popKind: "soldier",
      realmId: "qi_gathering",
      x: cell.x,
      y: cell.y,
    }),
  );
  return true;
}

/**
 * Advances the saved hire serial until it names an id no unit uses.
 * @param host - World whose meta serial increases
 * @returns A unique mercenary id
 */
function nextMercenaryId(host: EconomyHost): string {
  const taken = new Set(host.units.map((unit) => unit.id));
  let id = "";
  do {
    host.economy.mercenarySerial += 1;
    id = `mercenary-${host.economy.mercenarySerial}`;
  } while (taken.has(id));
  return id;
}

/**
 * Searches rings outward from `origin` for a cell allies can stand on.
 * Within a ring, cells are scanned row by row so the choice is deterministic.
 * @param host - World of footprints and map bounds
 * @param origin - Cell to spawn beside
 * @returns The nearest open on-map cell, or null when the map is full
 */
function nearestOpenCell(host: EconomyHost, origin: Point): Point | null {
  const maxRadius = Math.max(host.map.width, host.map.height);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const cell = openCellOnRing(host, origin, radius);
    if (cell) return cell;
  }
  return null;
}

/**
 * @param host - World of footprints and map bounds
 * @param origin - Ring center
 * @param radius - Chebyshev distance of the ring
 * @returns The first open cell on that ring, or null
 */
function openCellOnRing(
  host: EconomyHost,
  origin: Point,
  radius: number,
): Point | null {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (cellOpenToAlly(host, x, y)) return { x, y };
    }
  }
  return null;
}
