import {
  RESOURCE_IDS,
  type RealmId,
  type ResourceId,
  type SchoolId,
} from "../types";
import type {
  BigUnitSpawn,
  HeroBuildingView,
  HeroCalamityPorts,
} from "./ports";
import type { ResourceCost } from "./types";

/** One damage call recorded by the stub combat port. */
export interface StubDamage {
  raw: number;
  sourceId: string;
  targetId: string;
}

/** Cultivation record kept by the stub cultivation port. */
export interface StubCultivator {
  realmId: RealmId;
  schoolId: SchoolId | null;
  treasureSlots: number;
}

/**
 * A headless stand-in for the economy, inventory, cultivation, and combat
 * chunks. Tests and early prototypes drive it directly; the real chunks
 * replace it by implementing `HeroCalamityPorts`.
 */
export interface StubWorld {
  buildings: Map<string, HeroBuildingView>;
  cultivators: Map<string, StubCultivator>;
  damage: StubDamage[];
  items: Map<string, number>;
  popCap: number;
  /** Pop used by everything except heroes and the Calamity. */
  popUsed: number;
  ports: HeroCalamityPorts;
  revived: { buildingId: string; unitId: string }[];
  spawned: (BigUnitSpawn & { unitId: string })[];
  stockpile: Record<ResourceId, number>;
}

/**
 * @param overrides - Starting values that differ from an empty, roomy Hold
 * @returns A stub world whose `ports` read and write its own fields
 */
export function createStubWorld(
  overrides: Partial<
    Pick<StubWorld, "popCap" | "popUsed"> & {
      stockpile: Partial<Record<ResourceId, number>>;
    }
  > = {},
): StubWorld {
  const stockpile = Object.fromEntries(
    RESOURCE_IDS.map((id) => [id, overrides.stockpile?.[id] ?? 0]),
  ) as Record<ResourceId, number>;
  const fields: Omit<StubWorld, "ports"> = {
    buildings: new Map(),
    cultivators: new Map(),
    damage: [],
    items: new Map(),
    popCap: overrides.popCap ?? 100,
    popUsed: overrides.popUsed ?? 0,
    revived: [],
    spawned: [],
    stockpile,
  };
  // `ports` is filled in below; the closures must read this same object.
  const world = fields as StubWorld;

  const canAfford = (cost: ResourceCost): boolean =>
    Object.entries(cost).every(
      ([id, amount]) => world.stockpile[id as ResourceId] >= (amount ?? 0),
    );

  world.ports = {
    combat: {
      applyDamage: (sourceId, targetId, raw) => {
        world.damage.push({ raw, sourceId, targetId });
      },
      reviveUnit: (unitId, buildingId) => {
        world.revived.push({ buildingId, unitId });
      },
      spawnUnit: (spawn) => {
        const unitId = `${spawn.kind}-${spawn.definitionId}-${world.spawned.length + 1}`;
        world.spawned.push({ ...spawn, unitId });
        return unitId;
      },
    },
    cultivation: {
      getRealm: (unitId) =>
        world.cultivators.get(unitId)?.realmId ?? "qi_gathering",
      registerCultivator: (unitId, profile) => {
        world.cultivators.set(unitId, { ...profile, realmId: "qi_gathering" });
      },
      setSchool: (unitId, schoolId) => {
        const cultivator = world.cultivators.get(unitId);
        if (!cultivator) {
          return;
        }
        cultivator.schoolId = schoolId;
      },
    },
    economy: {
      getBuilding: (buildingId) => world.buildings.get(buildingId) ?? null,
      getPopCap: () => world.popCap,
      getPopUsed: () => world.popUsed,
      getStockpile: () => world.stockpile,
      listBuildings: () => [...world.buildings.values()],
      trySpend: (cost) => {
        if (!canAfford(cost)) {
          return false;
        }
        for (const [id, amount] of Object.entries(cost)) {
          world.stockpile[id as ResourceId] -= amount ?? 0;
        }
        return true;
      },
    },
    inventory: {
      consumeItem: (itemId, amount) => {
        const held = world.items.get(itemId) ?? 0;
        if (held < amount) {
          return false;
        }
        world.items.set(itemId, held - amount);
        return true;
      },
      countItem: (itemId) => world.items.get(itemId) ?? 0,
    },
  };

  return world;
}

/**
 * Adds or replaces a building in a stub world.
 *
 * @param world - Stub world to change
 * @param building - Building to place
 * @returns The same building, for chaining in tests
 */
export function placeStubBuilding(
  world: StubWorld,
  building: HeroBuildingView,
): HeroBuildingView {
  world.buildings.set(building.id, building);
  return building;
}
