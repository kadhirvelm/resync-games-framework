/**
 * Headless economy. `createEconomy` runs the economy module on a Descent sim
 * so gathering, placement, and yield share the sim's tick and command queue.
 */

import { createDescentSim, type DescentSim } from "../sim";
import type { SimWorldState } from "../sim/world";
import {
  type ClassId,
  type Command,
  RESOURCE_IDS,
  type ResourceStockpile,
} from "../types";
import {
  beginLayer,
  buyCoinSink,
  damageBuilding,
  payTraining,
  upgradeHold,
} from "./actions";
import { recomputeBonuses } from "./bonuses";
import type {
  BuildingInit,
  DeepWorkView,
  EconomyBuildingView,
  EconomyHost,
  EconomyInit,
  EconomyUnit,
  HoldTier,
  ResourceNode,
  SpiritVein,
  UnitInit,
} from "./model";
import { economyModule } from "./module";
import {
  addItem,
  canAffordPop,
  consumeItem,
  getHoldTier,
  getItemCount,
  getPopCap,
  getPopUsed,
  isOnSpiritVein,
  listBuildings,
  listNodes,
  listUnits,
  readStockpile,
  releasePopulation,
  reservePopulation,
} from "./queries";
import {
  asBuilding,
  createBuildingRecord,
  createUnitRecord,
  economyHost,
} from "./records";
import { trySpend as spendResources } from "./stockpile";
import { cellOpen, releaseVillagers } from "./villagers";
import { listWorks, seedWork, startDig } from "./works";

/**
 * Queries and commands for one Hold. Mutating methods other than `enqueue`
 * are the in-tick hooks sibling chunks call; `step` is what advances time.
 */
export class EconomySession {
  /**
   * @param sim - Sim that owns the command queue and tick
   * @param world - Live world the sim mutates
   */
  constructor(
    private readonly sim: DescentSim,
    private readonly world: SimWorldState,
  ) {}

  /** @returns Ticks completed so far */
  get tick(): number {
    return this.world.tick;
  }

  /**
   * Queues a player command for the next tick.
   * @param command - Place, trade, ration, brew, or recall
   */
  enqueue(command: Command): void {
    this.sim.enqueue(command);
  }

  /**
   * Advances the sim, which runs the economy tick each step.
   * @param n - How many ticks to run. Defaults to 1.
   * @returns Ticks that actually ran
   */
  step(n = 1): number {
    return this.sim.step(n);
  }

  /**
   * @returns A copy of the eight resource totals
   */
  getStockpile(): ResourceStockpile {
    return readStockpile(this.host());
  }

  /**
   * Removes a cost when every resource covers it.
   * @param cost - Amounts to spend. Missing resources count as zero.
   * @returns Whether the stockpile changed
   */
  trySpend(cost: Partial<ResourceStockpile>): boolean {
    return spendResources(this.host(), cost);
  }

  /**
   * @returns Villager and soldier population, plus reservations
   */
  getPopUsed(): number {
    return getPopUsed(this.host());
  }

  /**
   * @returns The cap, including finished housing
   */
  getPopCap(): number {
    return getPopCap(this.host());
  }

  /**
   * @param delta - Extra population a breakthrough would add
   * @returns Whether that increase still fits
   */
  canAffordPop(delta: number): boolean {
    return canAffordPop(this.host(), delta);
  }

  /**
   * Holds population while a unit channels a breakthrough.
   * @param delta - Population to reserve
   * @returns Whether the reservation fit
   */
  reservePopulation(delta: number): boolean {
    return reservePopulation(this.host(), delta);
  }

  /**
   * Releases a failed channel's reservation.
   * @param delta - Population to give back
   */
  releasePopulation(delta: number): void {
    releasePopulation(this.host(), delta);
  }

  /**
   * @returns Copies of the buildings and their placement flags
   */
  listBuildings(): EconomyBuildingView[] {
    return listBuildings(this.host());
  }

  /**
   * @param buildingId - Building to test
   * @returns Whether it stands on a Spirit Vein
   */
  isOnSpiritVein(buildingId: string): boolean {
    return isOnSpiritVein(this.host(), buildingId);
  }

  /**
   * @returns Copies of the units, including fed modifiers and carried loads
   */
  listUnits(): EconomyUnit[] {
    return listUnits(this.host());
  }

  /**
   * @returns Copies of the surface nodes
   */
  listNodes(): ResourceNode[] {
    return listNodes(this.host());
  }

  /**
   * @returns Copies of the deep works and their deposits
   */
  listDeepWorks(): DeepWorkView[] {
    return listWorks(this.host());
  }

  /**
   * @returns Camp, Stronghold, or Citadel
   */
  getHoldTier(): HoldTier {
    return getHoldTier(this.host());
  }

  /**
   * @param itemId - Pill or purchased item
   * @returns How many are stored
   */
  getItemCount(itemId: string): number {
    return getItemCount(this.host(), itemId);
  }

  /**
   * @param itemId - Item to remove
   * @returns Whether one was removed
   */
  consumeItem(itemId: string): boolean {
    return consumeItem(this.host(), itemId);
  }

  /**
   * @param itemId - Item to store
   * @param count - How many to add. Defaults to 1.
   */
  addItem(itemId: string, count = 1): void {
    addItem(this.host(), itemId, count);
  }

  /**
   * Pays one trainee's food and water when a Barracks is finished and pop fits.
   * @param classId - Class to train
   * @returns Whether the cost was paid
   */
  tryPayTrainingCost(classId: ClassId): boolean {
    return payTraining(this.host(), classId);
  }

  /**
   * Takes classes whose training cost was paid since the last call.
   * @returns Those classes, in the order they were paid
   */
  takePendingTraining(): ClassId[] {
    return this.host().economy.pendingTraining.splice(0);
  }

  /**
   * Starts the next Deep Mine depth when the cost and tier allow it.
   * @param buildingId - Deep Mine to dig
   * @returns Whether the dig started
   */
  dig(buildingId: string): boolean {
    return startDig(this.host(), buildingId);
  }

  /**
   * Pays for the next hold tier and starts its timer.
   * @returns Whether the upgrade started
   */
  upgradeHold(): boolean {
    return upgradeHold(this.host());
  }

  /**
   * Damages a building. A volatile furnace also hurts its neighbors.
   * @param buildingId - Building to hit
   * @param amount - Damage
   */
  damageBuilding(buildingId: string, amount: number): void {
    damageBuilding(this.host(), buildingId, amount);
  }

  /**
   * Starts a layer with new ground. Old deposits and nodes do not carry over.
   * @param layerId - Layer now being played
   * @param nodes - Fresh surface nodes
   * @param veins - Fresh veins. Omit to keep the current veins.
   */
  beginLayer(
    layerId: string,
    nodes: readonly ResourceNode[],
    veins?: readonly SpiritVein[],
  ): void {
    beginLayer(this.host(), layerId, nodes, veins);
  }

  /**
   * Buys a mercenary, treasure blank, or herb pack. Calamity is refused.
   * @param sinkId - Coin sink id
   * @returns Whether the purchase happened
   */
  buyCoinSink(sinkId: string): boolean {
    return buyCoinSink(this.host(), sinkId);
  }

  /**
   * Lets garrisoned villagers work again.
   */
  releaseVillagers(): void {
    releaseVillagers(this.host());
  }

  /**
   * @param x - Cell column
   * @param y - Cell row
   * @param side - Ally units pass gates. The horde does not.
   * @returns Whether that side can enter the cell
   */
  isCellPassable(x: number, y: number, side: "ally" | "horde"): boolean {
    return cellOpen(this.host(), x, y, side);
  }

  /**
   * @returns The live host around the sim world
   */
  private host(): EconomyHost {
    return economyHost(this.world);
  }
}

/**
 * Builds a Hold on a fresh sim and applies the scenario before tick 0.
 * @param init - Map, stockpile, units, buildings, nodes, and veins
 * @returns A session whose `step` runs the economy
 */
export function createEconomy(init: EconomyInit = {}): EconomySession {
  let world: SimWorldState | null = null;
  const wrapped = {
    ...economyModule,
    init(next: SimWorldState) {
      economyModule.init?.(next);
      world = next;
    },
  };
  const sim = createDescentSim({
    layerId: init.layerId ?? "ashen_gate",
    map: { height: init.height ?? 48, width: init.width ?? 48 },
    modules: [wrapped],
    seed: init.seed ?? 1,
  });
  if (!world) throw new Error("Economy module did not receive a world");
  seedEconomyWorld(world, init);
  return new EconomySession(sim, world);
}

/**
 * Copies scenario data onto a world the module already initialized.
 * @param world - Fresh world
 * @param init - Scenario
 */
export function seedEconomyWorld(
  world: SimWorldState,
  init: EconomyInit,
): void {
  const host = economyHost(world);
  if (init.tier) host.economy.tier = init.tier;
  applyStockpile(host, init.stockpile);
  for (const vein of init.veins ?? []) host.economy.veins.push({ ...vein });
  for (const node of init.nodes ?? []) host.economy.nodes.push({ ...node });
  for (const building of init.buildings ?? []) {
    host.buildings.push(createBuildingRecord(building));
  }
  for (const unit of init.units ?? []) host.units.push(createUnitRecord(unit));
  for (const building of host.buildings) {
    const record = asBuilding(building);
    if (!record.completed) continue;
    seedWork(host, record);
  }
  recomputeBonuses(host);
}

/**
 * @param host - World whose stockpile is overwritten for provided keys
 * @param stockpile - Partial starting totals
 */
function applyStockpile(
  host: EconomyHost,
  stockpile: Partial<ResourceStockpile> | undefined,
): void {
  if (!stockpile) return;
  for (const resourceId of RESOURCE_IDS) {
    const amount = stockpile[resourceId];
    if (amount === undefined) continue;
    host.resources[resourceId] = amount;
  }
}

export type { BuildingInit, EconomyInit, UnitInit };
