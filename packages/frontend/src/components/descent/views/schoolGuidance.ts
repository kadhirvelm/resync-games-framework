import {
  describeQiArt,
  isCultivatorClass,
} from "../logic/slice/sliceCultivatorPowers";
import type { SchoolId } from "../logic/types";
import type { ShellUnit } from "./shellModel";

/** School passives shared by every soldier, whether or not they use Qi. */
const SCHOOL_PASSIVES: Readonly<Record<SchoolId, string>> = {
  blood: "Attacks heal the attacker through lifesteal.",
  ember: "Hits burn, and burns spread when a target dies.",
  rime: "Hits chill; a second hit briefly freezes the target.",
};

/**
 * Explains a school's universal combat passive.
 * @param school - School being considered
 * @returns Plain-language passive description
 */
export function schoolPassiveDescription(school: SchoolId): string {
  return SCHOOL_PASSIVES[school];
}

/**
 * Resolves the exact Qi Art a class gains from a school, or null for ordinary
 * soldiers who cannot cast. This keeps Sword, Flying-Sword, and Formation
 * cultivators from seeing one another's abilities.
 * @param unit - Unit choosing a school
 * @param school - School being considered
 * @returns Named art and description, or null for non-Qi soldiers
 */
export function schoolQiArtDescription(
  unit: ShellUnit,
  school: SchoolId,
): string | null {
  if (!isCultivatorClass(unit.classId)) return null;
  const rank = unit.cultivation?.rank ?? "Ashborn";
  const spec = describeQiArt(unit.classId, school, rank);
  return `${spec.name}: ${spec.description}`;
}

/**
 * Builds one command-card school summary with only abilities the unit owns.
 * @param unit - Unit choosing a school
 * @param school - School being considered
 * @returns Passive plus class-appropriate Qi Art, when present
 */
export function schoolChoiceSummary(unit: ShellUnit, school: SchoolId): string {
  const art = schoolQiArtDescription(unit, school);
  if (art === null) return schoolPassiveDescription(school);
  return `${schoolPassiveDescription(school)} ${art}`;
}
