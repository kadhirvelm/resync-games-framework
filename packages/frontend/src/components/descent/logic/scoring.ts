import { getUnitDefinition } from "./combat/unitCatalog";
import { REALMS } from "./cultivation/data";
import { asBuilding, isEconomyUnit } from "./economy/records";
import { buildingDef, trainingCost } from "./economy/tables";
import type { SimWorldState } from "./sim/world";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  isAshenGateSliceState,
  type PlayerScoreProgress,
  sliceState,
} from "./slice/sliceState";
import type { BuildingState, ClassId, RankTitle, UnitState } from "./types";

/**
 * Age of Empires II-inspired fraction of resource value awarded as score.
 * @see https://ageofempires.fandom.com/wiki/Score
 */
export const PLAYER_SCORE_VALUE_RATE = 0.2;

/** One player's live score, split into the three Descent score categories. */
export interface PlayerScoreBreakdown {
  /** Completed cultivation-breakthrough essence and material value. */
  cultivation: number;
  /** Surviving owned unit and completed building value. */
  economy: number;
  /** Attributed enemy unit kill value. */
  military: number;
  /** Sum of the rounded category scores. */
  total: number;
}

/** A roster player and their current score, ready for the multiplayer HUD. */
export interface PlayerScoreStanding {
  color: string;
  id: string;
  name: string;
  score: PlayerScoreBreakdown;
  slotIndex: number;
}

/** Read-only world fields needed to project player scores. */
export interface PlayerScoreWorld {
  buildings: readonly BuildingState[];
  meta: Readonly<Record<string, unknown>>;
  units: readonly UnitState[];
}

/**
 * Sums a sparse resource cost. Every resource is worth one value point, which
 * mirrors Age of Empires II's resource-value scoring without inventing market
 * prices for Descent's rarer resources.
 * @param cost - Sparse resource cost to value
 * @returns Non-negative total resource value
 */
function resourceValue(cost: object | undefined): number {
  if (cost === undefined) return 0;
  let total = 0;
  for (const amount of Object.values(cost) as unknown[]) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
    total += Math.max(0, amount);
  }
  return total;
}

/**
 * Values a living or destroyed unit from its canonical training cost.
 * @param classId - Unit class to value
 * @returns Total food, water, and other training resources
 */
export function unitResourceValue(classId: ClassId): number {
  if (classId === "villager") return resourceValue(trainingCost(classId));
  return resourceValue(getUnitDefinition(classId).trainingCost);
}

/**
 * Values the completed breakthrough leaving `sourceRank`, including its
 * personal essence requirement and shared-stockpile material cost.
 * @param sourceRank - Rank from which the breakthrough began
 * @returns Breakthrough resource value, or zero for the terminal rank
 */
function breakthroughResourceValue(sourceRank: RankTitle): number {
  const realm = REALMS.find((entry) => entry.rank === sourceRank);
  const breakthrough = realm?.breakthrough;
  if (breakthrough === undefined) return 0;
  return resourceValue(breakthrough.materials) + breakthrough.essence;
}

/**
 * Returns mutable cumulative scoring state for a rostered player, repairing
 * saves that predate score tracking.
 * @param world - Live simulation world
 * @param playerId - Roster player to credit
 * @returns Player progress, or null outside multiplayer or for an unknown id
 */
function mutableProgress(
  world: SimWorldState,
  playerId: string,
): PlayerScoreProgress | null {
  const state = sliceState(world);
  if (state.players?.[playerId] === undefined) return null;
  const allProgress = state.scoreProgress ?? {};
  state.scoreProgress = allProgress;
  const progress = allProgress[playerId] ?? {
    cultivationValue: 0,
    militaryValue: 0,
  };
  allProgress[playerId] = progress;
  return progress;
}

/**
 * Permanently credits an owned unit or tower's enemy kill to its player.
 * @param world - Live simulation world
 * @param playerId - Owner of the killing combatant
 * @param killedUnitValue - Resource value of the destroyed enemy
 */
export function creditPlayerMilitary(
  world: SimWorldState,
  playerId: string,
  killedUnitValue: number,
): void {
  if (!Number.isFinite(killedUnitValue) || killedUnitValue <= 0) return;
  const progress = mutableProgress(world, playerId);
  if (progress === null) return;
  progress.militaryValue += killedUnitValue;
}

/**
 * Permanently credits a successful cultivation breakthrough to its owner.
 * Research-like score persists even if that cultivator later falls.
 * @param world - Live simulation world
 * @param playerId - Owner of the advancing cultivator
 * @param sourceRank - Rank from which the breakthrough began
 */
export function creditPlayerCultivation(
  world: SimWorldState,
  playerId: string,
  sourceRank: RankTitle,
): void {
  const value = breakthroughResourceValue(sourceRank);
  if (value <= 0) return;
  const progress = mutableProgress(world, playerId);
  if (progress === null) return;
  progress.cultivationValue += value;
}

/**
 * Converts a raw resource-value total into displayed points.
 * @param value - Cumulative or current resource value
 * @returns Rounded score points
 */
function scorePoints(value: number): number {
  return Math.round(value * PLAYER_SCORE_VALUE_RATE);
}

/**
 * Calculates every roster player's current score from deterministic state.
 * Economy counts surviving owned units and completed standard buildings;
 * military and cultivation use cumulative credited values. Shared stockpiles
 * and owner-scoped Hold upgrades are excluded because this scoring model
 * values only surviving standard buildings and units.
 * @param world - Simulation world or snapshot
 * @returns Roster-order standings with category and total scores
 */
export function calculatePlayerScores(
  world: PlayerScoreWorld,
): PlayerScoreStanding[] {
  const state = world.meta[ASHEN_GATE_SLICE_MODULE_ID];
  if (!isAshenGateSliceState(state)) return [];
  const players = Object.values(state.players ?? {}).sort(
    (left, right) => left.slotIndex - right.slotIndex,
  );
  const economyValues = new Map<string, number>(
    players.map((player): [string, number] => [player.id, 0]),
  );

  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0 || unit.ownerId === undefined) {
      continue;
    }
    const current = economyValues.get(unit.ownerId);
    if (current === undefined) continue;
    economyValues.set(unit.ownerId, current + unitResourceValue(unit.classId));
  }

  for (const building of world.buildings) {
    const record = asBuilding(building);
    if (
      !record.completed ||
      record.placeholder ||
      record.ownerId === undefined
    ) {
      continue;
    }
    const current = economyValues.get(record.ownerId);
    if (current === undefined) continue;
    economyValues.set(
      record.ownerId,
      current + resourceValue(buildingDef(record.buildingType)?.cost),
    );
  }

  return players.map((player) => {
    const progress = state.scoreProgress?.[player.id];
    const economy = scorePoints(economyValues.get(player.id) ?? 0);
    const military = scorePoints(progress?.militaryValue ?? 0);
    const cultivation = scorePoints(progress?.cultivationValue ?? 0);
    return {
      ...player,
      score: {
        cultivation,
        economy,
        military,
        total: cultivation + economy + military,
      },
    };
  });
}
