/**
 * Shared Descent vocabulary. Names follow `docs/descent/01-shared-contract.md`
 * exactly; other chunks import from here instead of redeclaring them.
 *
 * Everything reachable from `SimSnapshot` or saved state must stay JSON-safe
 * (plain objects, arrays, strings, finite numbers, booleans, null).
 */

/** The eight harvested resources, in canonical display order. */
export const RESOURCE_IDS = [
  "food",
  "water",
  "wood",
  "stone",
  "iron",
  "coin",
  "spirit_herbs",
  "essence",
] as const;

/** One harvested resource. */
export type ResourceId = (typeof RESOURCE_IDS)[number];

/** Stockpile amounts keyed by every resource. */
export type ResourceStockpile = Record<ResourceId, number>;

/** Unit classes, including the non-combat villager. */
export type ClassId =
  | "villager"
  | "warden"
  | "hunter"
  | "rider"
  | "raider"
  | "breaker"
  | "adept";

/** Player-selectable shapes used for grouped military movement. */
export type FormationId = "column" | "line" | "ranks" | "wedge";

/** Combat schools chosen at Sworn and locked for the run. */
export type SchoolId = "ember" | "rime" | "blood";

/** Internal realm ids, lowest to highest. */
export type RealmId =
  | "qi_gathering"
  | "foundation"
  | "core_formation"
  | "nascent_soul"
  | "ascension";

/** Player-facing rank titles for each realm. */
export type RankTitle =
  | "Ashborn"
  | "Sworn"
  | "Veteran"
  | "Champion"
  | "Ascended";

/**
 * Every player action. Input adapters build one of these and pass it to
 * `DescentSim.enqueue`; nothing outside the sim mutates world state.
 */
export type Command =
  | {
      type: "order_move";
      formation?: FormationId;
      /** Shift-click: walk there after the current legs instead of now. */
      queue?: boolean;
      unitIds: string[];
      x: number;
      y: number;
    }
  | { type: "set_formation"; formation: FormationId; unitIds: string[] }
  | { type: "order_attack"; unitIds: string[]; targetId: string }
  | {
      type: "place_building";
      buildingType: string;
      x: number;
      y: number;
      /** Villagers sent to build the new site. */
      builderIds?: string[];
    }
  | {
      type: "train_unit";
      buildingId: string;
      classId: ClassId;
      /** How many orders to queue. Omitted means one. Shift-click sends five. */
      count?: number;
    }
  | { type: "cancel_training"; buildingId: string; jobId: string }
  | {
      type: "set_rally_point";
      buildingId: string;
      /** Resource node to rally on; trained villagers start gathering it. */
      nodeId?: string;
      x: number;
      y: number;
    }
  | { type: "brew_pill"; furnaceId: string; pillId: string }
  | { type: "feed_pill"; unitId: string; pillId: string }
  | { type: "equip_treasure"; unitId: string; treasureId: string }
  | { type: "start_breakthrough"; unitId: string; hallId: string }
  | { type: "choose_school"; unitId: string; school: SchoolId }
  | { type: "summon_calamity"; altarId: string; calamityId: string }
  | { type: "issue_rations"; messHallId: string; unitIds: string[] }
  | { type: "market_trade"; sell: ResourceId; buy: ResourceId; amount: number }
  | { type: "upgrade_hold" }
  | { type: "recall_villagers" }
  | { type: "descend" }
  // Hold verbs the integrated game needs beyond the illustrative contract.
  | {
      type: "order_attack_move";
      formation?: FormationId;
      /** Shift-click: go there after the current legs instead of now. */
      queue?: boolean;
      unitIds: string[];
      x: number;
      y: number;
    }
  | { type: "order_stop"; unitIds: string[] }
  | { type: "assign_gather"; unitIds: string[]; nodeId: string }
  | { type: "assign_build"; unitIds: string[]; buildingId: string }
  | { type: "release_villagers" }
  | { type: "train_hero"; hallId: string; heroId: string }
  | { type: "revive_hero"; hallId: string; heroId: string };

/** Discriminant of every command. */
export type CommandType = Command["type"];

/** The command variant with the given discriminant. */
export type CommandOfType<TType extends CommandType> = Extract<
  Command,
  { type: TType }
>;

/**
 * A queued command. `tick` is the sim tick that will consume it and `seq` is
 * a sim-wide counter that breaks ties, so replay order never depends on
 * wall-clock time.
 */
export interface StampedCommand {
  command: Command;
  seq: number;
  tick: number;
}

/**
 * Minimal unit record. Later chunks add fields (health, realm, school, …);
 * keep additions JSON-safe and optional or initialized by their module.
 */
export interface UnitState {
  classId: ClassId;
  id: string;
  x: number;
  y: number;
}

/**
 * Minimal building record. The economy chunk owns building types and adds
 * fields such as tier and construction progress.
 */
export interface BuildingState {
  buildingType: string;
  id: string;
  x: number;
  y: number;
}

/** Playable map bounds in world units. */
export interface MapBounds {
  height: number;
  width: number;
}

/** Read-only view of the sim that renderers and UI subscribe to. */
export interface SimSnapshot {
  buildings: readonly BuildingState[];
  layerId: string | null;
  map: MapBounds;
  /** Extension bags other chunks fill, keyed by module id. */
  meta: Readonly<Record<string, unknown>>;
  paused: boolean;
  resources: Readonly<ResourceStockpile>;
  speed: number;
  tick: number;
  units: readonly UnitState[];
}
