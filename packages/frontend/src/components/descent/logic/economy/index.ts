/**
 * Public economy surface. Other chunks should import from here.
 */

export {
  beginLayer,
  buyCoinSink,
  damageBuilding,
  issueRations,
  payTraining,
  placeBuilding,
  rationCost,
  startBrew,
  trade,
  upgradeHold,
} from "./actions";
export {
  createEconomy,
  EconomySession,
  seedEconomyWorld,
} from "./economy";
export {
  buildingCovering,
  type FootprintSite,
  footprintBodyRadius,
  footprintCells,
  footprintCovers,
  footprintDistance,
  footprintGap,
  footprintRadius,
  footprintReach,
  footprintSide,
} from "./footprint";
export {
  growthFraction,
  HARVESTERS_PER_BUILDING,
  harvestDef,
  isRipe,
} from "./harvest";
export { compareIds } from "./ids";
export type {
  BuildingInit,
  EconomyBuilding,
  EconomyBuildingView,
  EconomyHost,
  EconomyInit,
  EconomyMeta,
  EconomyUnit,
  HoldTier,
  ProductionJob,
  ResourceNode,
  SpiritVein,
  UnitInit,
  UnitModifier,
  UnreachableTarget,
} from "./model";
export {
  createEconomyModule,
  ECONOMY_MODULE_ID,
  type EconomyModuleOptions,
  economyModule,
} from "./module";
export {
  breakthroughPopDelta,
  CALAMITY_POP,
  HERO_POP,
  populationWeight,
  SOLDIER_POP,
  VILLAGER_POP,
} from "./pop";
export { stepProduction } from "./production";
export {
  addItem,
  canAffordPop,
  consumeItem,
  type FedBonuses,
  fedBonuses,
  getHoldTier,
  getItemCount,
  getPopCap,
  getPopUsed,
  listBuildings,
  listNodes,
  listUnits,
  readStockpile,
  releasePopulation,
  reservePopulation,
} from "./queries";
export {
  asBuilding,
  asUnit,
  createBuildingRecord,
  createEconomyMeta,
  createUnitRecord,
  economyHost,
  ensureEconomyMeta,
  isEconomyUnit,
  normalizeEconomyMeta,
} from "./records";
export { canAfford, trySpend } from "./stockpile";
export {
  type BuildingProductionDef,
  buildingDef,
  coinSinkDef,
  deepWorkDef,
  holdTierDef,
  listBuildingDefs,
  listCoinSinks,
  listDeepWorkDefs,
  listMarketLayers,
  listPillRecipes,
  listResources,
  marketRates,
  pillRecipe,
  resourceDef,
  workerSlots,
} from "./tables";
export { runEconomyTick } from "./tick";
export {
  activeWorkers,
  assignedWorkers,
  cellOpen,
  cellOpenToAlly,
  constructionHp,
  constructionProgressPerStep,
  MAX_BUILDERS_PER_SITE,
  recallVillagers,
  releaseVillagers,
  UNREACHABLE_COOLDOWN_STEPS,
} from "./villagers";
