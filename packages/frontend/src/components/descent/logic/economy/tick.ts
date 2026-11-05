/**
 * One economy tick, after that tick's commands have already been applied.
 * The sim runs this from the economy phase. Views never call it.
 */

import { advanceUpgrade, stepBrewing } from "./actions";
import { recomputeBonuses } from "./bonuses";
import type { EconomyHost } from "./model";
import { stepProduction } from "./production";
import {
  AUTO_VILLAGERS,
  expireModifiers,
  stepConstruction,
  stepVillagers,
  type VillagerPolicy,
} from "./villagers";
import { stepWorks } from "./works";

/**
 * Gathers, builds, yields, and refreshes placement flags for one tick.
 * @param host - World to advance
 * @param policy - Whether idle villagers choose their own jobs
 */
export function runEconomyTick(
  host: EconomyHost,
  policy: VillagerPolicy = AUTO_VILLAGERS,
): void {
  expireModifiers(host);
  advanceUpgrade(host);
  stepVillagers(host, policy);
  stepConstruction(host, policy);
  stepWorks(host);
  stepProduction(host);
  recomputeBonuses(host);
  stepBrewing(host);
}
