import type { SimModule } from "./modules";

/*
 * Empty extension point for the generic sim. Playable scenarios pass an
 * explicit module list so experimental chunks cannot silently affect them.
 * Each system keeps its code in its own folder. Order matters within a phase:
 * processors in the same phase run in this array's order.
 *
 *   economy      → chunk 03 (resources, villagers, buildings, placement)
 *   combat       → chunk 04 (classes, counters, resolve)
 *   cultivation  → chunk 05 (realms, pills, treasures, breakthroughs)
 *   heroes       → chunk 06 (Hero Hall, Calamity Altar)
 *   layers       → chunk 07 (layer rules, hazards, descend gate)
 *   waves        → chunk 08 (Omen, wave clock, bosses, Hell Pressure)
 *
 * UI (chunk 09) never registers here: views call `sim.subscribe` and read
 * `sim.snapshot()`, and send input with `sim.enqueue`.
 */

/** Modules every new Descent sim runs, unless a caller passes its own list. */
export const DESCENT_SIM_MODULES: readonly SimModule[] = [];
