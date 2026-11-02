import type { SimModule } from "../sim/modules";
import type { SimWorldState } from "../sim/world";
import { isLayerId, OMEN_TOWER_BUILDING_TYPE } from "./catalog";
import {
  createWaveState,
  isWaveClockState,
  readOmen,
  resolveCasualty,
  resolveWaveTick,
} from "./clock";
import type {
  OmenPreview,
  WaveClockState,
  WaveEvent,
  WaveGatePort,
} from "./types";

/** Sim-module id. Snapshot readers look up `meta.waves`. */
export const WAVES_MODULE_ID = "waves";

/**
 * Creates the waves sim module.
 * Register it on `DESCENT_SIM_MODULES` (phase `waves` is already reserved).
 * Pass the layers runtime as `gate` so a boss casualty can open descent.
 * The processor runs once per sim tick and does not run while the sim is paused.
 * Each tick it copies `world.map` onto the clock so spawns fit the map, keeps
 * the highest essence seen as wave power, and opens the gate when a boss died
 * through a direct `damageWaveUnit` call since the last tick.
 * @param gate - Layers gate, when the host has one
 * @returns A sim module
 */
export function createWavesModule(gate?: WaveGatePort): SimModule {
  return {
    id: WAVES_MODULE_ID,
    init(world) {
      world.meta.waves = freshState(world);
    },
    processors: [
      {
        id: "waves.clock",
        phase: "waves",
        run(context) {
          let state = requireState(context.world);
          const completed = context.tick + 1;
          const layerId = isLayerId(context.world.layerId)
            ? context.world.layerId
            : null;
          if (layerId !== state.layerId) {
            state = retarget(context.world, state, layerId, completed);
            context.world.meta.waves = state;
            gate?.setBossGateCleared(false);
          }
          state.completedTick = completed;
          state.omenTower = hasOmenTower(context.world);
          state.mapHeight = context.world.map.height;
          state.mapWidth = context.world.map.width;
          state.collectedEssence = Math.max(
            state.collectedEssence,
            context.world.resources.essence,
          );
          const events = resolveWaveTick(state);
          grantEssence(context.world, events);
          for (const event of events) {
            context.emit(WAVES_MODULE_ID, event.type, event);
          }
          syncGate(state, gate);
          syncUnits(context.world, state);
        },
      },
    ],
  };
}

/**
 * Default module with no layers runtime attached. Hosts that own the gate
 * should prefer `createWavesModule(runtime)`.
 */
export const wavesModule: SimModule = createWavesModule();

/**
 * Applies a combat death to the clock stored on a world.
 * @param world - Sim world
 * @param unitId - Horde body that died
 * @param gate - Layers gate to open when the body is the boss
 * @returns Events from the casualty
 */
export function noteWaveCasualty(
  world: SimWorldState,
  unitId: string,
  gate?: WaveGatePort,
): WaveEvent[] {
  const state = requireState(world);
  const result = resolveCasualty(state, unitId);
  world.resources.essence += result.essence;
  if (result.gateCleared) gate?.setBossGateCleared(true);
  syncUnits(world, state);
  return result.events;
}

/**
 * Reads the omen from a sim snapshot's meta bag.
 * @param meta - Snapshot meta
 * @returns The preview, or null when waves are absent or the tower cannot see
 */
export function getOmenFromMeta(
  meta: Readonly<Record<string, unknown>>,
): OmenPreview | null {
  if (!isWaveClockState(meta.waves)) return null;
  return readOmen(meta.waves);
}

/**
 * Reads Hell Pressure from a sim snapshot's meta bag.
 * @param meta - Snapshot meta
 * @returns The meter, or 0 when waves are absent
 */
export function getHellPressureFromMeta(
  meta: Readonly<Record<string, unknown>>,
): number {
  if (!isWaveClockState(meta.waves)) return 0;
  return meta.waves.hellPressure;
}

/**
 * Builds the clock for a brand-new world.
 * @param world - Fresh world
 * @returns A clock aligned to tick 0
 */
function freshState(world: SimWorldState): WaveClockState {
  const layerId = isLayerId(world.layerId) ? world.layerId : null;
  const state = createWaveState(layerId, 0, world.map);
  state.collectedEssence = world.resources.essence;
  state.omenTower = hasOmenTower(world);
  return state;
}

/**
 * Drops the previous horde and starts the clock at the new layer. Collected
 * essence carries over, so spending never weakens later waves.
 * @param world - Sim world
 * @param previous - Clock being replaced
 * @param layerId - Next layer, or null
 * @param completed - Tick the change happens on
 * @returns The new clock, not yet resolved for `completed`
 */
function retarget(
  world: SimWorldState,
  previous: WaveClockState,
  layerId: WaveClockState["layerId"],
  completed: number,
): WaveClockState {
  removeTracked(world, previous);
  const next = createWaveState(layerId, completed, world.map);
  next.collectedEssence = Math.max(
    previous.collectedEssence,
    world.resources.essence,
  );
  next.omenTower = hasOmenTower(world);
  return next;
}

/**
 * Adds essence named by this tick's events to the stockpile.
 * @param world - Sim world
 * @param events - Events just resolved
 */
function grantEssence(
  world: SimWorldState,
  events: readonly WaveEvent[],
): void {
  let granted = 0;
  for (const event of events) {
    if (event.type === "essence_payout") granted += event.amount;
    if (event.type === "boss_killed") granted += event.drops.essence;
  }
  world.resources.essence += granted;
}

/**
 * Opens the attached gate when the clock recorded a boss kill the gate has
 * not heard about (the integrator calls `damageWaveUnit` directly).
 * @param state - Wave clock
 * @param gate - Layers gate, when attached
 */
function syncGate(state: WaveClockState, gate: WaveGatePort | undefined): void {
  if (!gate || !state.bossGateCleared) return;
  if (gate.isBossGateCleared()) return;
  gate.setBossGateCleared(true);
}

/**
 * Rebuilds the world's horde entries from the living wave units and trims
 * the tracked id list to the bodies that are still alive.
 * @param world - Sim world
 * @param state - Wave clock
 */
function syncUnits(world: SimWorldState, state: WaveClockState): void {
  removeTracked(world, state);
  state.trackedUnitIds = state.units.map((unit) => unit.id);
  for (const unit of state.units) {
    world.units.push({
      classId: unit.classId,
      id: unit.id,
      x: unit.x,
      y: unit.y,
    });
  }
}

/**
 * Removes every body this clock has ever spawned.
 * @param world - Sim world
 * @param state - Wave clock
 */
function removeTracked(world: SimWorldState, state: WaveClockState): void {
  const tracked = new Set(state.trackedUnitIds);
  world.units = world.units.filter((unit) => !tracked.has(unit.id));
}

/**
 * Reads the clock, throwing when the module was not initialized.
 * @param world - Sim world
 * @returns The live clock
 */
function requireState(world: SimWorldState): WaveClockState {
  if (!isWaveClockState(world.meta.waves)) {
    throw new Error("Waves module was not initialized");
  }
  return world.meta.waves;
}

/**
 * Reports whether the world has a completed Omen Tower. A tower still under
 * construction (or a record without `completed`) cannot see.
 * @param world - Sim world
 * @returns Whether a finished omen tower is present
 */
function hasOmenTower(world: SimWorldState): boolean {
  return world.buildings.some(
    (building) =>
      building.buildingType === OMEN_TOWER_BUILDING_TYPE &&
      (building as { completed?: boolean }).completed === true,
  );
}
