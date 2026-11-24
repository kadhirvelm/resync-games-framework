export {
  DOWNHILL_MAX_SPEED_MULTIPLIER,
  DOWNHILL_SLOPE_FACTOR,
  type ElevationGradient,
  elevationAt,
  elevationGradientAt,
  HIGH_GROUND_DAMAGE_BONUS,
  HIGH_GROUND_RANGED_BONUS,
  HIGH_GROUND_THRESHOLD,
  highGroundDamageMultiplier,
  highGroundRangeBonus,
  isOnHighGround,
  LOW_GROUND_DAMAGE_PENALTY,
  MAX_HILL_ELEVATION,
  slopeSpeedMultiplier,
  UPHILL_MIN_SPEED_MULTIPLIER,
  UPHILL_SLOPE_FACTOR,
} from "./elevation";
export { activeHazardsAt, rotationSlotAt } from "./hazardRotation";
export {
  baseEssencePerKill,
  coldMultipliersAt,
  collectVentBurns,
  type EnvironmentContext,
  environmentAt,
  type HazardBurn,
  healingMultiplierFor,
  isInsideVolume,
  LAYER_TERRAIN_META_KEY,
  type LayerTerrain,
  setLayerTerrain,
  ventBurnPerSecondAt,
  visionMultiplierAt,
  worldTerrainBridges,
  worldTerrainHills,
  worldTerrainObstacles,
  worldVentVolumes,
} from "./hazards";
export {
  LayerRuntime,
  type LayerRuntimeOptions,
  type LayerRuntimePorts,
} from "./layerRuntime";
export {
  isRankWithinCap,
  LAYER_TABLE,
  parseLayerTable,
  RANK_ORDER,
  rankIndex,
} from "./layerTable";
export type * from "./layerTypes";
