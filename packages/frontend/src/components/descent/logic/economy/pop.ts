/**
 * Weighted population. Heroes and Calamities keep their contract weights, but
 * `countedPop` omits them: the hero module adds that share itself.
 */

import type { RealmId } from "../types";
import type { EconomyUnit, PopKind } from "./model";

/** Soldier population by realm, matching the shared contract. */
export const SOLDIER_POP: Record<RealmId, number> = {
  ascension: 4,
  core_formation: 2,
  foundation: 1,
  nascent_soul: 3,
  qi_gathering: 1,
};

/** Hero population. Counted by the hero module, not `getPopUsed`. */
export const HERO_POP = 5;

/** Calamity population. Counted by the hero module, not `getPopUsed`. */
export const CALAMITY_POP = 10;

/** Villager population. */
export const VILLAGER_POP = 1;

/**
 * Full contract weight, including heroes and Calamities.
 * @param unit - Unit whose kind and realm decide the weight
 * @returns Population the unit represents
 */
export function populationWeight(
  unit: Pick<EconomyUnit, "popKind" | "realmId">,
): number {
  if (unit.popKind === "villager") return VILLAGER_POP;
  if (unit.popKind === "hero") return HERO_POP;
  if (unit.popKind === "calamity") return CALAMITY_POP;
  return SOLDIER_POP[unit.realmId ?? "qi_gathering"];
}

/**
 * Population economy itself charges against the cap.
 * @param unit - Unit to score
 * @returns 0 for heroes and Calamities, otherwise the contract weight
 */
export function countedPop(
  unit: Pick<EconomyUnit, "popKind" | "realmId">,
): number {
  if (unit.popKind === "hero" || unit.popKind === "calamity") return 0;
  return populationWeight(unit);
}

/**
 * Extra population a realm change needs.
 * @param from - Realm the unit holds now
 * @param to - Realm the breakthrough would enter
 * @returns The increase in soldier population, which can be zero
 */
export function breakthroughPopDelta(from: RealmId, to: RealmId): number {
  return SOLDIER_POP[to] - SOLDIER_POP[from];
}

/**
 * Population of one newly trained soldier or villager.
 * @param kind - Villager or soldier. Heroes are not trained here.
 * @returns The weight a single trainee adds
 */
export function traineePop(kind: PopKind): number {
  if (kind === "villager") return VILLAGER_POP;
  if (kind === "soldier") return SOLDIER_POP.qi_gathering;
  return 0;
}
