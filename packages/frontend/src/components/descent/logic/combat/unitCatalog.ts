import unitData from "../../data/units.json";
import type { CombatClassId, RankTitle, UnitDefinition } from "./types";

const COMBAT_CLASSES: readonly CombatClassId[] = [
  "warden",
  "hunter",
  "rider",
  "raider",
  "breaker",
  "adept",
];

const RANK_TITLES: readonly RankTitle[] = [
  "Ashborn",
  "Sworn",
  "Veteran",
  "Champion",
  "Ascended",
];

/**
 * Validates one class id read from JSON.
 * @param value - JSON class id
 * @returns A combat class id
 */
function parseCombatClassId(value: string): CombatClassId {
  if (COMBAT_CLASSES.includes(value as CombatClassId)) {
    return value as CombatClassId;
  }
  throw new Error(`Unknown Descent combat class: ${value}`);
}

/**
 * Validates one rank title read from JSON.
 * @param value - JSON rank title
 * @returns A shared rank title
 */
function parseRankTitle(value: string): RankTitle {
  if (RANK_TITLES.includes(value as RankTitle)) {
    return value as RankTitle;
  }
  throw new Error(`Unknown Descent rank title: ${value}`);
}

/** Data-driven definitions for the trainable combat classes. */
export const UNIT_DEFINITIONS: readonly UnitDefinition[] = unitData.map(
  (definition): UnitDefinition => ({
    ...definition,
    attackKind: definition.attackKind === "projectile" ? "projectile" : "melee",
    classId: parseCombatClassId(definition.classId),
    defaultRankTitle: parseRankTitle(definition.defaultRankTitle),
  }),
);

/**
 * Gets the base definition for a combat class.
 * @param classId - Class to look up
 * @returns Its data-driven unit definition
 */
export function getUnitDefinition(classId: CombatClassId): UnitDefinition {
  const definition = UNIT_DEFINITIONS.find(
    (candidate) => candidate.classId === classId,
  );
  if (!definition) {
    throw new Error(`Missing Descent unit definition: ${classId}`);
  }
  return definition;
}
