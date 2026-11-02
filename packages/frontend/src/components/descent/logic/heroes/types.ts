import type { ClassId, ResourceId, SchoolId } from "../types";

/** Building tier ladder; a building at a higher tier satisfies a lower gate. */
export type HoldTier = "Camp" | "Stronghold" | "Citadel";

/** Sparse resource cost. */
export type ResourceCost = Partial<Record<ResourceId, number>>;

/** Base combat stats, named to match `data/units.json`. */
export interface BigUnitStats {
  armor: number;
  attackKind: "melee" | "projectile";
  attackRange: number;
  attacksPerSecond: number;
  damage: number;
  maxHitPoints: number;
  projectileSpeed?: number;
  speed: number;
  structureDamageMultiplier: number;
  vision: number;
}

/**
 * A hero's signature ability. Stored as data only: actives are deferred, so
 * `executes` is always false and nothing in the sim reads the other fields.
 */
export interface UltimateDefinition {
  cooldownSeconds: number;
  description: string;
  executes: false;
  id: string;
  name: string;
}

/** How a hero gets a school: preset by data, or picked at Sworn. */
export type HeroSchoolChoice = "preset" | "at_sworn";

/** One hero in the Hero Hall pool. */
export interface HeroDefinition {
  /** `null` means the design leaves the class open (Ilya). */
  classId: Exclude<ClassId, "villager"> | null;
  id: string;
  lore: string;
  name: string;
  /** Class used in combat while `classId` is open. Placeholder. */
  provisionalClassId?: Exclude<ClassId, "villager">;
  schoolChoice: HeroSchoolChoice;
  schoolId: SchoolId | null;
  startsLocked: boolean;
  stats: BigUnitStats;
  title: string;
  trainCost: ResourceCost;
  trainSeconds: number;
  ultimate: UltimateDefinition;
}

/** Essence and channel time for a revive, scaled by the hero's realm. */
export interface ReviveRule {
  baseEssence: number;
  baseSeconds: number;
  essencePerRealm: number;
  secondsPerRealm: number;
}

/** Everything in `data/heroes.json`. */
export interface HeroTable {
  aliveCap: number;
  hallBuildingType: string;
  hallMinTier: HoldTier;
  heroes: HeroDefinition[];
  popCost: number;
  revive: ReviveRule;
  treasureSlots: number;
}

/**
 * Calamity special rules. Only `passesWalls` / `burnsPath` /
 * `wallBurnFraction` are read by this module; the rest are for combat.
 */
export interface CalamityTraits {
  burnsPath?: boolean;
  chillFieldRadius?: number;
  growOnKill?: number;
  healOnNearbyDeath?: number;
  nearbyDeathRadius?: number;
  passesWalls?: boolean;
  wallBurnFraction?: number;
}

/** One Calamity the Altar can summon. */
export interface CalamityDefinition {
  bossCores: number;
  /** Counter-triangle class, so Breakers and Hunters still beat it. */
  classId: Exclude<ClassId, "villager">;
  counterHints: string[];
  essenceCost: number;
  id: string;
  lore: string;
  name: string;
  schoolId: SchoolId;
  stats: BigUnitStats;
  summonSeconds: number;
  traits: CalamityTraits;
}

/** Beacon and horn cue data shipped with every summon-start event. */
export interface CalamityTelegraph {
  beacon: boolean;
  hornPitchSemitones: number;
  hornSoundFamily: string;
}

/** Everything in `data/calamities.json`. */
export interface CalamityTable {
  altarBuildingType: string;
  altarMinTier: HoldTier;
  bossCoreItemId: string;
  calamities: CalamityDefinition[];
  maxActive: number;
  popCost: number;
  sealWardBuildingType: string;
  telegraph: CalamityTelegraph;
}

/**
 * Hero lifecycle. `training`, `alive`, and `reviving` count toward the cap
 * and use pop; `awaiting_revive` does neither.
 */
export type HeroStatus =
  | "locked"
  | "available"
  | "training"
  | "alive"
  | "awaiting_revive"
  | "reviving";

/** Saved per-hero state. JSON-safe. */
export interface HeroRecord {
  /** Tick the current training or revive channel finishes, if any. */
  channelEndsAtTick: number | null;
  /** How many times this hero has fallen this run. */
  falls: number;
  /** Hall running the current channel, or the Hall the hero came from. */
  hallId: string | null;
  heroId: string;
  /** UI/narrative hook: lit when the hero is trained or revived. */
  lanternLit: boolean;
  schoolId: SchoolId | null;
  status: HeroStatus;
  /** Sim unit id once the hero has been trained; kept through revives. */
  unitId: string | null;
}

/** Public hero view returned by `listHeroes`. */
export interface HeroState extends HeroRecord {
  canAct: boolean;
  classId: Exclude<ClassId, "villager"> | null;
  name: string;
  popCost: number;
  title: string;
  treasureSlots: number;
}

/** A Calamity summon that is still channeling. */
export interface CalamitySummon {
  altarId: string;
  calamityId: string;
  completesAtTick: number;
  startedAtTick: number;
}

/** The one Calamity on the field. */
export interface ActiveCalamity {
  altarId: string;
  calamityId: string;
  unitId: string;
}

/** All state this module saves. JSON-safe. */
export interface HeroCalamityState {
  activeCalamity: ActiveCalamity | null;
  aliveHeroCap: number;
  heroes: Record<string, HeroRecord>;
  summon: CalamitySummon | null;
  tick: number;
  ticksPerSecond: number;
}

/** Result of a gate check or an action. `reasons` is empty when `ok`. */
export interface ActionResult {
  ok: boolean;
  reasons: string[];
}

/** Events this module emits for UI, audio, and narrative. */
export type HeroCalamityEvent =
  | { type: "hero_unlocked"; heroId: string; tick: number }
  | {
      type: "hero_training_started";
      hallId: string;
      heroId: string;
      completesAtTick: number;
      tick: number;
    }
  | {
      type: "hero_trained";
      hallId: string;
      heroId: string;
      lanternLit: boolean;
      tick: number;
      unitId: string;
    }
  | { type: "hero_fallen"; heroId: string; tick: number; unitId: string }
  | {
      type: "hero_revive_started";
      essenceSpent: number;
      hallId: string;
      heroId: string;
      completesAtTick: number;
      tick: number;
    }
  | {
      type: "hero_revived";
      hallId: string;
      heroId: string;
      lanternLit: boolean;
      tick: number;
      unitId: string;
    }
  | {
      type: "hero_channel_interrupted";
      hallId: string;
      heroId: string;
      tick: number;
    }
  | {
      type: "hero_school_chosen";
      heroId: string;
      schoolId: SchoolId;
      tick: number;
    }
  | {
      type: "calamity_summon_started";
      altarId: string;
      calamityId: string;
      completesAtTick: number;
      telegraph: CalamityTelegraph;
      tick: number;
    }
  | {
      type: "calamity_summon_completed";
      altarId: string;
      calamityId: string;
      tick: number;
      unitId: string;
    }
  | {
      type: "calamity_summon_aborted";
      altarId: string;
      calamityId: string;
      reason: "altar_destroyed";
      tick: number;
    }
  | { type: "calamity_died"; calamityId: string; tick: number; unitId: string };

/** Hero commands. The shared `Command` union has no hero verbs yet. */
export type HeroCommand =
  | { type: "train_hero"; hallId: string; heroId: string }
  | { type: "revive_hero"; heroId: string; hallId?: string };

/** One tile on the straight line between a Calamity and its target. */
export interface StrikePathTile {
  /** Structure id on the tile, if any; walls must have one. */
  structureId: string | null;
  wall: boolean;
}

/** Outcome of a Calamity strike across a path of tiles. */
export interface CalamityStrikeResult {
  /** Wall that stopped the strike, if any. */
  blockedByWallId: string | null;
  /** Walls burned on the way through (Colossus only). */
  burnedWallIds: string[];
  /** Whether the strike reached its target. */
  hitTarget: boolean;
}
