import type {
  CardCharacterLevelNumber,
  EnemyActionKind,
  PlayableCardRules,
  SpriteAnimationKind,
  SpriteFacing,
} from "@resync-game-framework/api";

/** Coreborn tier from 1 through 4. Matches the four portrait levels. */
export type TierNumber = CardCharacterLevelNumber;

/** Highest tier merging can reach. */
export const MAX_TIER: TierNumber = 4;

/** One card design. Decks hold copies of these. */
export interface CardDefinition {
  /** Lore line shown under the rules, when the card has one */
  flavor?: string;
  id: string;
  /** Illustration URL. Missing cards draw a painted stand-in. */
  imageUrl?: string;
  rules: PlayableCardRules;
}

/** How a Coreborn fights. Picks its stand-in cards and base health. */
export type CorebornRole = "guardian" | "striker" | "mender" | "mystic";

/** One tier of a Coreborn: its portrait and the card it brings at that tier. */
export interface CorebornTierDefinition {
  card: CardDefinition;
  portraitUrl?: string;
  tier: TierNumber;
  title: string;
}

/** One animation strip a battle sprite can play. */
export interface UnitSpriteAnimation {
  /** Frames per second */
  fps: number;
  frameCount: number;
  /** Whether it repeats, like idle, or plays once */
  loop: boolean;
  /** URL of the horizontal PNG strip */
  stripUrl: string;
}

/** Battle sprite moves. They match the sprite sheet's animation rows. */
export type UnitSpriteMove = SpriteAnimationKind;

/**
 * An animated full-body figure that stands in for a unit's portrait in
 * battle. Every strip shares one frame size and feet baseline.
 */
export interface UnitSprite {
  /** Strips by move. A move without a strip falls back to idle. */
  animations: Partial<Record<UnitSpriteMove, UnitSpriteAnimation>>;
  /** Screen direction the painted figure faces */
  facing: SpriteFacing;
  frameHeight: number;
  frameWidth: number;
  /** Sprite-sheet id, shared by every unit that uses this figure */
  id: string;
}

/** A recruitable ally. Copies in the party point back at this template. */
export interface CorebornTemplate {
  /** Health at tier 1. Each tier above adds {@link TIER_HIT_POINT_BONUS}. */
  baseHitPoints: number;
  description: string;
  id: string;
  name: string;
  role: CorebornRole;
  /** Animated battle figure, when the character has a sprite sheet */
  sprite?: UnitSprite;
  /** Index 0 is tier 1. Always four entries. */
  tiers: CorebornTierDefinition[];
}

/** Health a Coreborn gains for each tier above 1. */
export const TIER_HIT_POINT_BONUS = 8;

/** Who an enemy attack lands on. */
export type EnemyTargetPattern = "front" | "back" | "all";

/** One step in an enemy's repeating cycle, after scaling for its floor. */
export interface EnemyMove {
  amount: number;
  kind: EnemyActionKind;
  /** Attack target. Ignored for defend. */
  target: EnemyTargetPattern;
  text: string;
}

/** A generated or built-in enemy before it is scaled for a floor. */
export interface EnemyTemplate {
  /** One-shot played when this enemy lands a blow */
  attackSoundUrl?: string;
  description: string;
  id: string;
  imageUrl?: string;
  maxHitPoints: number;
  moves: EnemyMove[];
  name: string;
  /** Animated battle figure, when the enemy has a sprite sheet */
  sprite?: UnitSprite;
}

/** Backdrop and story for one room. */
export interface RoomScene {
  /** Looping room tone, when the dungeon generated one */
  ambienceUrl?: string;
  description: string;
  id: string;
  imageUrl?: string;
  title: string;
}

/** The player's cultivator: identity, art, and starting kit. */
export interface CultivatorDefinition {
  aetherPerTurn: number;
  maxHitPoints: number;
  name: string;
  /** First-realm portrait, used outside a climb */
  portraitUrl?: string;
  /** One portrait per cultivation realm, first realm first */
  realmPortraitUrls?: string[];
  /** Animated battle figure, when the cultivator has one */
  sprite?: UnitSprite;
  /** One entry per copy in the opening deck */
  starterDeck: CardDefinition[];
  title: string;
}

/** Where a tower's content came from. */
export type TowerSource = "dungeon" | "gallery" | "built-in";

/** Generated music and stingers for one climb. Missing cues stay synthesized. */
export interface TowerSoundtrack {
  music: Partial<Record<"camp" | "battle" | "boss", string>>;
  stingers: Partial<Record<"victory" | "defeat" | "reward", string>>;
}

/** Everything one climb can draw from. Built before the run starts. */
export interface TowerContent {
  coreborn: CorebornTemplate[];
  cultivator: CultivatorDefinition;
  enemies: EnemyTemplate[];
  id: string;
  scenes: RoomScene[];
  source: TowerSource;
  /** Generated score, when the package has clips */
  soundtrack?: TowerSoundtrack;
  /** Story intro shown before the climb */
  summary: string;
  /** Non-Coreborn cards offered as technique rewards */
  techniques: CardDefinition[];
  title: string;
}

/** Reward a room grants when its battle is won. */
export type RoomRewardKind =
  | "coreborn"
  | "monster-cards"
  | "techniques"
  | "health";

/** One enemy placed in a room, scaled for that floor. */
export interface EnemySpawn {
  /** One-shot played when this enemy lands a blow */
  attackSoundUrl?: string;
  description: string;
  id: string;
  imageUrl?: string;
  isBoss: boolean;
  maxHitPoints: number;
  moves: EnemyMove[];
  name: string;
  /** Animated figure drawn in place of the portrait, when one exists */
  sprite?: UnitSprite;
  templateId: string;
}

/** One floor of the tower. */
export interface TowerRoom {
  enemies: EnemySpawn[];
  floor: number;
  isBoss: boolean;
  /** The boss room has no reward kind: beating it ends the climb. */
  reward?: RoomRewardKind;
  scene?: RoomScene;
}

/** The player's cultivator or a recruited Coreborn, between battles. */
export interface PartyMember {
  /** Copies of this Coreborn's current-tier card in the deck */
  cardCopies: number;
  hitPoints: number;
  id: string;
  kind: "cultivator" | "coreborn";
  maxHitPoints: number;
  /** Coreborn template id. Empty for the cultivator. */
  templateId: string;
  tier: TierNumber;
}

/** Health reward choices. */
export type HealthRewardOption = "mend" | "fortify";

/** Choices the player sees after a room is cleared. */
export type RewardOffer =
  | { kind: "coreborn"; templateIds: string[] }
  | { kind: "monster-cards"; memberIds: string[] }
  | { cards: CardDefinition[]; kind: "techniques" }
  | { kind: "health"; options: HealthRewardOption[] };

/** Where the run is in its loop. */
export type RunPhase =
  | "recruit"
  | "camp"
  | "battle"
  | "reward"
  | "defeat"
  | "victory";

/** Running totals shown when the run ends. */
export interface RunStats {
  battlesWon: number;
  corebornLost: string[];
  merges: number;
  recruited: number;
}

/**
 * Bonuses a climb starts with, from the player's permanent cultivation.
 * Fixed when the climb begins.
 */
export interface RunModifiers {
  /** Maximum health every newly recruited Coreborn gains */
  corebornBonusHitPoints: number;
  /** Rerolls left for reward offers this climb */
  rerollsLeft: number;
  /** Health every survivor recovers after each won battle */
  respiteHealing: number;
}

/** A climb with no cultivation bonuses. */
export const NO_RUN_MODIFIERS: RunModifiers = {
  corebornBonusHitPoints: 0,
  rerollsLeft: 0,
  respiteHealing: 0,
};

/** One climb, from entry to death or the crown. */
export interface RunState {
  /** Ascension level from 0. Higher levels scale every enemy up. */
  ascension: number;
  /** Cards the cultivator owns. One entry per copy. */
  cultivatorDeck: CardDefinition[];
  /** Index into `rooms` of the room being fought or prepared for */
  floorIndex: number;
  /** Offered at the start of the run: pick this many Coreborn. */
  initialRecruits: number;
  modifiers: RunModifiers;
  /** Ordered front to back. The cultivator can stand anywhere. */
  party: PartyMember[];
  pendingReward?: RewardOffer;
  phase: RunPhase;
  /** Next generator state for any random choice */
  randomState: number;
  rooms: TowerRoom[];
  stats: RunStats;
  /** Counter for unique party member ids */
  nextMemberNumber: number;
}

/** The cultivator's party member id. There is one per run. */
export const CULTIVATOR_MEMBER_ID = "cultivator";
