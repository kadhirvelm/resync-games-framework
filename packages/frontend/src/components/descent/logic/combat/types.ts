import type {
  ClassId,
  Command,
  RankTitle,
  ResourceId,
  SchoolId,
  StampedCommand,
} from "../types";

export type { ClassId, RankTitle, ResourceId, SchoolId };

/** The trainable classes that participate in combat. */
export type CombatClassId = Exclude<ClassId, "villager">;

/** A deterministic point in simulation space. */
export interface CombatPoint {
  x: number;
  y: number;
}

/** Food and water paid to train one unit. */
export interface TrainingCost {
  food: number;
  water: number;
}

/** Data-driven base stats for one trainable combat class. */
export interface UnitDefinition {
  armor: number;
  attackKind: "melee" | "projectile";
  attackRange: number;
  attacksPerSecond: number;
  barkKey: string;
  classId: CombatClassId;
  damage: number;
  defaultRankTitle: RankTitle;
  id: string;
  maxHitPoints: number;
  name: string;
  popCost: number;
  projectileSpeed?: number;
  speed: number;
  structureDamageMultiplier: number;
  trainingCost: TrainingCost;
  vision: number;
}

/** Damage-over-time state applied by Ember attacks. */
export interface BurnStatus {
  damagePerTick: number;
  elapsedMs: number;
  remainingMs: number;
  sourceId: string;
}

/** Movement slow state applied by the first Rime attack. */
export interface ChillStatus {
  remainingMs: number;
}

/** Brief immobilization state applied by a second Rime attack. */
export interface FrozenStatus {
  remainingMs: number;
}

/** Status effects currently affecting a unit. */
export interface UnitStatuses {
  burn?: BurnStatus;
  chill?: ChillStatus;
  frozen?: FrozenStatus;
}

/** An order currently being carried out by a unit. */
export type UnitOrder =
  | { destination: CombatPoint; pace?: number; type: "move" }
  | {
      destination: CombatPoint;
      /** Top speed while marching with a group, so it arrives together. */
      pace?: number;
      targetId?: string;
      type: "attack_move";
    }
  | { targetId: string; type: "attack_target" };

/** One combatant in the fixed-tick simulation. */
export interface CombatUnit {
  armor: number;
  attackCooldownMs: number;
  attackKind: "melee" | "projectile";
  attackRange: number;
  attacksPerSecond: number;
  /**
   * How far this body extends beyond an ordinary unit's, in map cells. Attack
   * range is measured to the edge of a larger body, so attackers held off by
   * its bulk can still reach it. Omitted for ordinary units.
   */
  bodyRadius?: number;
  classId: ClassId;
  damage: number;
  definitionId?: string;
  factionId: string;
  hasLongLife?: boolean;
  hasTreasure?: boolean;
  hitPoints: number;
  id: string;
  isWaveUnit?: boolean;
  maxHitPoints: number;
  merit: number;
  order?: UnitOrder;
  popCost: number;
  position: CombatPoint;
  projectileSpeed?: number;
  rankTitle: RankTitle;
  school?: SchoolId;
  speed: number;
  statuses: UnitStatuses;
  structureDamageMultiplier: number;
  vision: number;
}

/** A destructible wall or building target. */
export interface CombatBuilding {
  armor: number;
  /** Distance from the center to the building's edge; attackers reach the edge. */
  bodyRadius?: number;
  factionId: string;
  hitPoints: number;
  id: string;
  maxHitPoints: number;
  position: CombatPoint;
}

/**
 * Formation details a group move can carry. Each unit walks to its own slot
 * instead of the clicked point, and a group moves at its slowest member's
 * speed.
 */
export interface FormationOrderFields {
  /** Each unit's own destination; units not listed use the clicked point. */
  destinations?: Record<string, CombatPoint>;
  /** Whether the group marches at its slowest member's speed. */
  keepPace?: boolean;
}

/** Orders accepted by this chunk's stamped command queue. */
export type CombatCommand =
  | (Extract<Command, { type: "order_move" }> & FormationOrderFields)
  | Extract<Command, { type: "order_attack" }>
  | ({
      type: "order_attack_move";
      unitIds: string[];
      x: number;
      y: number;
    } & FormationOrderFields)
  | { type: "order_stop"; unitIds: string[] };

/** A player command stamped for deterministic execution. */
export type StampedCombatCommand = Omit<StampedCommand, "command"> & {
  command: CombatCommand;
  issuedBy: string;
};

/** Observable output consumed by rendering and other simulation chunks. */
export type CombatEvent =
  | {
      amount: number;
      kind: "damage_applied";
      sourceId: string;
      targetId: string;
    }
  | {
      amount: number;
      hitPoints: number;
      kind: "building_damaged";
      sourceId: string;
      targetId: string;
    }
  | {
      attackKind: "melee" | "projectile";
      kind: "attack_started";
      sourceId: string;
      targetId: string;
    }
  | {
      effect: "burn" | "chill" | "frozen";
      kind: "status_applied";
      sourceId: string;
      targetId: string;
    }
  | { amount: number; kind: "unit_healed"; sourceId: string; unitId: string }
  | { amount: number; kind: "blood_power_spent"; unitId: string }
  | {
      killerId: string;
      kind: "unit_killed";
      meritLost: number;
      treasureDropped: boolean;
      unitId: string;
    }
  | { killerId: string; kind: "wave_unit_died"; unitId: string }
  | { command: StampedCombatCommand; kind: "command_executed" };

/** A hit waiting for a projectile travel delay to finish. */
export interface PendingProjectile {
  impactTick: number;
  rawDamage: number;
  sourceId: string;
  targetId: string;
}
