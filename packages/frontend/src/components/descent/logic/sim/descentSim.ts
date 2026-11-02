import type { Command, SimSnapshot, StampedCommand } from "../types";
import { isSimSpeed, SIM_SPEEDS, type SimSpeed } from "./constants";
import { DESCENT_SIM_MODULES } from "./extensionPoints";
import {
  compileSimPipeline,
  type SimEvent,
  type SimModule,
  type TickContext,
} from "./modules";
import { createSimRng, type SimRng } from "./rng";
import { parseSerializedWorld, serializeWorld } from "./saveFormat";
import {
  createWorldState,
  type SimWorldState,
  type WorldOptions,
} from "./world";

/** The deterministic Descent simulation. Headless; no React or DOM needed. */
export interface DescentSim {
  /**
   * Stamps a command for the next tick. Allowed while paused; queued
   * commands run only once ticks resume.
   * @param command - Player action
   * @returns The stamped copy that will run
   */
  enqueue(command: Command): StampedCommand;
  /**
   * Restores a serialized sim. Modules' `init` does not run again.
   * @param serialized - Output of `serialize`
   * @throws DescentSaveError when the save is unreadable
   */
  load(serialized: string): void;
  /**
   * Listens for sim events. Events fire at tick boundaries, after the tick
   * that raised them; a listener may pause but may not call `step`.
   * @param listener - Event callback
   * @returns Unsubscribe function
   */
  onEvent(listener: (event: SimEvent) => void): () => void;
  readonly paused: boolean;
  readonly seed: number;
  /** @returns The full versioned save string. */
  serialize(): string;
  /** @param paused - Whether ticks may advance */
  setPaused(paused: boolean): void;
  /**
   * @param multiplier - One of `SIM_SPEEDS`; ticks advanced per `stepFrame`
   * @throws RangeError for any other value
   */
  setSpeed(multiplier: number): void;
  /**
   * Returns a frozen view of the world. The same object is returned until
   * the sim changes, so it is safe for `useSyncExternalStore`.
   */
  snapshot(): SimSnapshot;
  readonly speed: SimSpeed;
  /**
   * Advances up to `n` ticks; stops early if paused (including by a listener).
   * @param n - Ticks to advance, default 1
   * @returns Ticks actually advanced
   */
  step(n?: number): number;
  /** @returns Ticks advanced: `speed` ticks, or 0 while paused. */
  stepFrame(): number;
  /**
   * Called after the snapshot changes (ticks, pause, speed, load).
   * @param listener - Change callback
   * @returns Unsubscribe function
   */
  subscribe(listener: () => void): () => void;
  /** Ticks completed. */
  readonly tick: number;
}

/** Options for `createDescentSim`. */
export interface DescentSimOptions extends WorldOptions {
  /** Modules to run; defaults to `DESCENT_SIM_MODULES`. */
  modules?: readonly SimModule[];
}

/**
 * Creates a sim with a fresh world. A starting `layerId` raises
 * `layer_started` at the beginning of the first `step` call.
 * @param options - Seed, starting layer, map bounds, and modules
 * @returns A ready sim at tick 0
 */
export function createDescentSim(options: DescentSimOptions): DescentSim {
  const pipeline = compileSimPipeline(options.modules ?? DESCENT_SIM_MODULES);
  let world = createWorldState(options);
  for (const simModule of pipeline.modules) {
    simModule.init?.(world);
  }
  let rng: SimRng = createSimRng(world);
  let cachedSnapshot: SimSnapshot | null = null;
  let stepping = false;
  const pendingEvents: SimEvent[] = [];
  const changeListeners = new Set<() => void>();
  const eventListeners = new Set<(event: SimEvent) => void>();

  if (world.layerId !== null) {
    pendingEvents.push({
      layerId: world.layerId,
      tick: 0,
      type: "layer_started",
    });
  }

  /** Drops the cached snapshot and tells subscribers. */
  const changed = () => {
    cachedSnapshot = null;
    for (const listener of [...changeListeners]) listener();
  };

  /** Delivers queued events in the order they were raised. */
  const flushEvents = () => {
    while (pendingEvents.length > 0) {
      const event = pendingEvents.shift() as SimEvent;
      for (const listener of [...eventListeners]) listener(event);
    }
  };

  /**
   * Builds the context handed to command handlers and processors.
   * @param tick - Index of the tick being processed
   * @returns The tick context
   */
  const createContext = (tick: number): TickContext => ({
    emit(moduleId, name, data = null) {
      pendingEvents.push({
        data: structuredClone(data),
        moduleId,
        name,
        tick,
        type: "module",
      });
    },
    nextEntityId(prefix) {
      const id = `${prefix}-${world.nextEntitySeq}`;
      world.nextEntitySeq += 1;
      return id;
    },
    rng,
    startLayer(layerId) {
      world.layerId = layerId;
      pendingEvents.push({ layerId, tick, type: "layer_started" });
    },
    tick,
    world,
  });

  /** Applies this tick's commands, then every processor by phase. */
  const runTick = () => {
    const tick = world.tick;
    const context = createContext(tick);
    for (const stamped of takeDueCommands(world, tick)) {
      const handler = pipeline.commandHandlers.get(stamped.command.type);
      handler?.(stamped.command, context);
    }
    for (const processor of pipeline.processors) {
      processor.run(context);
    }
    world.tick = tick + 1;
  };

  const sim: DescentSim = {
    enqueue(command) {
      const stamped: StampedCommand = {
        command: structuredClone(command),
        seq: world.commandSeq,
        tick: world.tick,
      };
      world.commandSeq += 1;
      world.pendingCommands.push(stamped);
      return structuredClone(stamped);
    },
    load(serialized) {
      if (stepping) throw new Error("Cannot load a Descent sim mid-step");
      world = parseSerializedWorld(serialized);
      rng = createSimRng(world);
      pendingEvents.length = 0;
      changed();
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    get paused() {
      return world.paused;
    },
    get seed() {
      return world.seed;
    },
    serialize() {
      return serializeWorld(world);
    },
    setPaused(paused) {
      if (world.paused === paused) return;
      world.paused = paused;
      changed();
    },
    setSpeed(multiplier) {
      if (!isSimSpeed(multiplier)) {
        throw new RangeError(
          `Descent speed must be one of ${SIM_SPEEDS.join(", ")}; received ${multiplier}`,
        );
      }
      if (world.speed === multiplier) return;
      world.speed = multiplier;
      changed();
    },
    snapshot() {
      cachedSnapshot ??= createSnapshot(world);
      return cachedSnapshot;
    },
    get speed() {
      return world.speed;
    },
    step(n = 1) {
      if (!Number.isSafeInteger(n) || n < 0) {
        throw new RangeError(
          `step() needs a non-negative integer, received ${n}`,
        );
      }
      if (stepping)
        throw new Error("step() cannot be called from a sim listener");
      stepping = true;
      let advanced = 0;
      try {
        flushEvents();
        while (advanced < n && !world.paused) {
          runTick();
          advanced += 1;
          flushEvents();
        }
      } finally {
        stepping = false;
      }
      if (advanced > 0) changed();
      return advanced;
    },
    stepFrame() {
      return sim.step(world.speed);
    },
    subscribe(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    get tick() {
      return world.tick;
    },
  };
  return sim;
}

/**
 * Removes and returns commands stamped for this tick or earlier, in stamp
 * order. The queue is kept sorted because stamps only ever increase.
 * @param world - World whose queue is drained
 * @param tick - Tick being processed
 * @returns Commands to apply this tick
 */
export function takeDueCommands(
  world: SimWorldState,
  tick: number,
): StampedCommand[] {
  const dueCount = world.pendingCommands.findIndex(
    (stamped) => stamped.tick > tick,
  );
  const end = dueCount === -1 ? world.pendingCommands.length : dueCount;
  return world.pendingCommands.splice(0, end);
}

/**
 * Builds a deep-frozen copy of the renderer-visible state.
 * @param world - Live world
 * @returns An immutable snapshot
 */
export function createSnapshot(world: SimWorldState): SimSnapshot {
  return deepFreeze(
    structuredClone({
      buildings: world.buildings,
      layerId: world.layerId,
      map: world.map,
      meta: world.meta,
      paused: world.paused,
      resources: world.resources,
      speed: world.speed,
      tick: world.tick,
      units: world.units,
    }),
  );
}

/**
 * Freezes an object graph in place.
 * @param value - Freshly cloned value
 * @returns The same value, frozen
 */
function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
