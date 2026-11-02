import { LayerRuntime } from "../../layers/layerRuntime";
import type { LayerId } from "../../layers/layerTypes";
import type { SimModule } from "../../sim/modules";
import type { SimWorldState } from "../../sim/world";
import { getWave } from "../catalog";
import { isWaveClockState } from "../clock";
import { secondsToWaveTicks } from "../constants";
import { WaveDirector } from "../director";
import type { WaveClockState } from "../types";

/**
 * Starts a layer clock wired to a real descent gate.
 * @param layerId - Layer to arm
 * @param omen - Whether an Omen Tower is already built
 * @returns The clock and the layers runtime that owns the gate
 */
export function boot(
  layerId: LayerId,
  omen = true,
): { director: WaveDirector; runtime: LayerRuntime } {
  const runtime = new LayerRuntime({ startLayerId: layerId });
  const director = new WaveDirector({ gate: runtime });
  director.setOmenTowerPresent(omen);
  director.startLayer(layerId);
  return { director, runtime };
}

/**
 * Advances the clock to a sim-second mark on the current layer.
 * @param director - Clock under test
 * @param seconds - Seconds from the layer start
 */
export function stepTo(director: WaveDirector, seconds: number): void {
  const target = secondsToWaveTicks(seconds);
  const remaining = target - director.tick;
  if (remaining < 0) {
    throw new Error(`Clock is at tick ${director.tick}, past ${target}`);
  }
  director.step(remaining);
}

/**
 * Kills a horde body outright.
 * @param director - Clock under test
 * @param unitId - Body to remove
 */
export function kill(director: WaveDirector, unitId: string): void {
  director.damageUnit(unitId, 1_000_000);
}

/**
 * A sim module whose processor runs in the combat phase, before waves.
 * Tests use it to act like the integrator: damage bodies, spend essence,
 * or finish buildings between wave ticks.
 * @param onTick - Called each tick with the live world
 * @param init - Optional world setup before the first tick
 * @returns A probe module
 */
export function probeModule(
  onTick: (world: SimWorldState) => void,
  init?: (world: SimWorldState) => void,
): SimModule {
  return {
    id: "probe",
    ...(init ? { init } : {}),
    processors: [
      {
        id: "probe.tick",
        phase: "combat",
        run: (context) => onTick(context.world),
      },
    ],
  };
}

/**
 * Reads the wave clock a world carries.
 * @param world - Sim world with the waves module
 * @returns The live clock
 */
export function clockOf(world: SimWorldState): WaveClockState {
  if (!isWaveClockState(world.meta.waves)) {
    throw new Error("Waves module was not initialized");
  }
  return world.meta.waves;
}

/**
 * When a catalog wave spawns, so tests follow `waves.json` instead of
 * hard-coding a schedule that balance passes retune.
 * @param waveId - Catalog wave id
 * @returns Spawn time in sim seconds from layer start
 */
export function waveAt(waveId: string): number {
  return getWave(waveId).spawnAtSeconds;
}

/**
 * How many bodies a catalog wave's composition lists, before elites, bosses,
 * and summoned fodder.
 * @param waveId - Catalog wave id
 * @returns Body count
 */
export function bodiesIn(waveId: string): number {
  return getWave(waveId).composition.reduce(
    (total, group) => total + group.count,
    0,
  );
}
