import type { ThreeDAsset, ThreeDAssetKind } from "@resync-game-framework/api";

/** Stable gameplay-facing roles for generated Ashen Gate models. */
export type AshenGateAssetRole =
  | "environment"
  | "villager"
  | "warden"
  | "hunter"
  | "holdRaider"
  | "breaker"
  | "adept"
  | "raider"
  | "hordeWarden"
  | "hordeHunter"
  | "hordeBreaker"
  | "hordeAdept"
  | "cinderjaw"
  | "camp"
  | "barracks"
  | "cultivationHall"
  | "fireWard"
  | "emberVent"
  | "resourceGrove"
  | "resourceOutcrop"
  | "resourceTree"
  | "resourceWell";

/** One generated model expected by the Ashen Gate Babylon renderer. */
export interface AshenGateAssetDefinition {
  kind: ThreeDAssetKind;
  name: string;
  role: AshenGateAssetRole;
}

/**
 * Canonical model names shared by generation and runtime lookup. Names are
 * stable while generated ids may differ between machines and environments.
 */
export const ASHEN_GATE_3D_ASSETS = [
  { kind: "environment", name: "Descent Ashen Gate", role: "environment" },
  { kind: "character", name: "Descent Villager", role: "villager" },
  { kind: "character", name: "Descent Warden", role: "warden" },
  { kind: "character", name: "Descent Hunter", role: "hunter" },
  { kind: "character", name: "Descent Raider", role: "holdRaider" },
  { kind: "character", name: "Descent Breaker", role: "breaker" },
  { kind: "character", name: "Descent Adept", role: "adept" },
  { kind: "character", name: "Descent Imp Raider", role: "raider" },
  {
    kind: "character",
    name: "Descent Imp Warden",
    role: "hordeWarden",
  },
  {
    kind: "character",
    name: "Descent Imp Hunter",
    role: "hordeHunter",
  },
  {
    kind: "character",
    name: "Descent Imp Breaker",
    role: "hordeBreaker",
  },
  {
    kind: "character",
    name: "Descent Imp Adept",
    role: "hordeAdept",
  },
  { kind: "character", name: "Descent Cinderjaw", role: "cinderjaw" },
  { kind: "prop", name: "Descent Camp", role: "camp" },
  { kind: "prop", name: "Descent Barracks", role: "barracks" },
  {
    kind: "prop",
    name: "Descent Cultivation Hall",
    role: "cultivationHall",
  },
  { kind: "prop", name: "Descent Fire Ward", role: "fireWard" },
  { kind: "prop", name: "Descent Ember Vent", role: "emberVent" },
  {
    kind: "prop",
    name: "Descent Harvest Grove",
    role: "resourceGrove",
  },
  {
    kind: "prop",
    name: "Descent Ore Outcrop",
    role: "resourceOutcrop",
  },
  {
    kind: "prop",
    name: "Descent Harvest Tree",
    role: "resourceTree",
  },
  {
    kind: "prop",
    name: "Descent Spirit Well",
    role: "resourceWell",
  },
] as const satisfies readonly AshenGateAssetDefinition[];

/** Generated assets currently available to the real-time renderer. */
export type AshenGateAssetSet = Partial<
  Record<AshenGateAssetRole, ThreeDAsset>
>;

/**
 * Resolves the newest valid generated asset for each canonical Ashen Gate role.
 * @param assets - Category lists returned by the existing 3D asset services
 * @returns Role-keyed models; omitted roles deliberately use scene stand-ins
 */
export function resolveAshenGateAssets(
  assets: readonly ThreeDAsset[],
): AshenGateAssetSet {
  const byNewest = [...assets].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const resolved: AshenGateAssetSet = {};
  for (const definition of ASHEN_GATE_3D_ASSETS) {
    const match = byNewest.find(
      (asset) =>
        asset.kind === definition.kind &&
        asset.name === definition.name &&
        asset.validation.valid,
    );
    if (match !== undefined) resolved[definition.role] = match;
  }
  return resolved;
}

/**
 * Selects a generated character silhouette without leaking rules into Babylon.
 * @param unit - Published unit identity and faction
 * @returns Asset role used for this unit
 */
export function assetRoleForUnit(unit: {
  classId: string;
  factionId: "hold" | "horde";
  name: string;
}): AshenGateAssetRole {
  if (unit.name.toLowerCase().includes("cinderjaw")) return "cinderjaw";
  if (unit.classId === "villager") return "villager";
  if (unit.factionId === "horde") {
    if (unit.classId === "warden") return "hordeWarden";
    if (unit.classId === "hunter") return "hordeHunter";
    if (unit.classId === "breaker") return "hordeBreaker";
    if (unit.classId === "adept") return "hordeAdept";
    return "raider";
  }
  if (unit.classId === "hunter") return "hunter";
  if (unit.classId === "raider") return "holdRaider";
  if (unit.classId === "breaker") return "breaker";
  if (unit.classId === "adept") return "adept";
  return "warden";
}

/**
 * Selects the nearest generated structure silhouette for a published building.
 * @param buildingType - Stable economy building type
 * @returns Asset role used for this building
 */
export function assetRoleForBuilding(buildingType: string): AshenGateAssetRole {
  if (buildingType === "barracks") return "barracks";
  if (buildingType === "cultivation_hall") return "cultivationHall";
  if (buildingType.includes("fire_ward") || buildingType.includes("wall")) {
    return "fireWard";
  }
  return "camp";
}

/**
 * Selects a reusable harvestable prop family for a surface resource.
 * @param resourceId - Stable economy resource id
 * @returns Asset role used to render its gatherable node
 */
export function assetRoleForResource(resourceId: string): AshenGateAssetRole {
  if (resourceId === "wood") return "resourceTree";
  if (resourceId === "food" || resourceId === "spirit_herbs") {
    return "resourceGrove";
  }
  if (resourceId === "water" || resourceId === "essence") {
    return "resourceWell";
  }
  return "resourceOutcrop";
}

/**
 * @param role - Generated Ashen Gate asset role
 * @returns Whether the role is instantiated as a gatherable map decoration
 */
export function isResourceAssetRole(role: AshenGateAssetRole): boolean {
  return role.startsWith("resource");
}
