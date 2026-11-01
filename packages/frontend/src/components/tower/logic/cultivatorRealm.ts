import type { CultivatorDefinition, RunState } from "./towerTypes";

/**
 * A cultivator's portrait rises through its realms as the climb does: the
 * tower is split into one equal stretch per realm portrait.
 */

/**
 * Splits the climb into as many equal stretches as there are realms.
 * @param run - Current climb
 * @param realmCount - Realm portraits available
 * @returns Index of the realm the cultivator has reached, from 0
 */
export function cultivatorRealm(run: RunState, realmCount: number): number {
  if (realmCount <= 1 || run.rooms.length === 0) {
    return 0;
  }
  const floor = Math.min(run.floorIndex, run.rooms.length - 1);
  return Math.min(
    realmCount - 1,
    Math.floor((floor * realmCount) / run.rooms.length),
  );
}

/**
 * @param cultivator - Cultivator definition
 * @param run - Current climb; without one, the first realm is shown
 * @returns The portrait for the realm reached on this climb
 */
export function cultivatorPortraitUrl(
  cultivator: CultivatorDefinition,
  run?: RunState,
): string | undefined {
  const realms = cultivator.realmPortraitUrls;
  if (!realms || realms.length === 0 || !run) {
    return cultivator.portraitUrl;
  }
  return realms[cultivatorRealm(run, realms.length)];
}
