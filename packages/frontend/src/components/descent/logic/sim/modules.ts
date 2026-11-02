import type { CommandOfType, CommandType } from "../types";
import type { SimRng } from "./rng";
import type { SimWorldState } from "./world";

/**
 * Tick phases, run in this order after the tick's commands are applied.
 * Each later chunk registers processors into its own phase.
 */
export const SIM_PHASES = [
  "layers",
  "economy",
  "combat",
  "cultivation",
  "waves",
] as const;

/** One tick phase. */
export type SimPhase = (typeof SIM_PHASES)[number];

/** Emitted when a layer starts; the autosave hook listens for it. */
export interface LayerStartedEvent {
  layerId: string;
  tick: number;
  type: "layer_started";
}

/** A module-defined event for views (barks, toasts, sounds). */
export interface ModuleSimEvent {
  data: unknown;
  moduleId: string;
  name: string;
  tick: number;
  type: "module";
}

/**
 * Something that happened during a tick. Events are delivered to listeners
 * after the whole `step` call finishes, never mid-tick.
 */
export type SimEvent = LayerStartedEvent | ModuleSimEvent;

/** What command handlers and tick processors receive. */
export interface TickContext {
  /** Emits a module event, delivered after the step. */
  emit(moduleId: string, name: string, data?: unknown): void;
  /**
   * Returns a deterministic entity id such as `unit-12`.
   * @param prefix - Readable kind prefix
   */
  nextEntityId(prefix: string): string;
  readonly rng: SimRng;
  /**
   * Sets the current layer and emits `layer_started` (which autosaves).
   * @param layerId - Layer id owned by the layers chunk
   */
  startLayer(layerId: string): void;
  /** Index of the tick being processed. */
  readonly tick: number;
  /** The only mutable world reference. Mutate it only inside the tick. */
  readonly world: SimWorldState;
}

/** Applies one command during the tick it is stamped for. */
export type CommandHandler<TType extends CommandType> = (
  command: CommandOfType<TType>,
  context: TickContext,
) => void;

/** Command handlers keyed by command type. */
export type CommandHandlerMap = {
  [TType in CommandType]?: CommandHandler<TType>;
};

/** Runs once per tick in its phase. */
export interface TickProcessor {
  id: string;
  phase: SimPhase;
  run(context: TickContext): void;
}

/**
 * A chunk's contribution to the sim. Register it in `DESCENT_SIM_MODULES`
 * (or pass it to `createDescentSim`).
 */
export interface SimModule {
  /** Commands this module owns. Each command type has at most one owner. */
  commands?: CommandHandlerMap;
  id: string;
  /**
   * Seeds this module's state in a brand-new world (not on load).
   * @param world - The fresh world, before tick 0
   */
  init?(world: SimWorldState): void;
  processors?: readonly TickProcessor[];
}

/** Modules resolved into a dispatch table and an ordered processor list. */
export interface SimPipeline {
  commandHandlers: ReadonlyMap<CommandType, CommandHandler<CommandType>>;
  modules: readonly SimModule[];
  processors: readonly TickProcessor[];
}

/**
 * Resolves modules into the order ticks run them: processors by phase, then
 * by module order, then by declaration order.
 * @param modules - Registered modules
 * @returns The compiled pipeline
 * @throws If two modules share an id or claim the same command type
 */
export function compileSimPipeline(modules: readonly SimModule[]): SimPipeline {
  const moduleIds = new Set<string>();
  const commandHandlers = new Map<CommandType, CommandHandler<CommandType>>();
  for (const simModule of modules) {
    if (moduleIds.has(simModule.id)) {
      throw new Error(`Duplicate Descent sim module id: ${simModule.id}`);
    }
    moduleIds.add(simModule.id);
    registerCommandHandlers(simModule, commandHandlers);
  }
  const processors = SIM_PHASES.flatMap((phase) =>
    modules.flatMap((simModule) =>
      (simModule.processors ?? []).filter(
        (processor) => processor.phase === phase,
      ),
    ),
  );
  return { commandHandlers, modules, processors };
}

/**
 * Adds one module's command handlers to the dispatch table.
 * @param simModule - Module being registered
 * @param handlers - Dispatch table, mutated in place
 * @throws If a command type already has an owner
 */
function registerCommandHandlers(
  simModule: SimModule,
  handlers: Map<CommandType, CommandHandler<CommandType>>,
): void {
  const entries = Object.entries(simModule.commands ?? {}) as [
    CommandType,
    CommandHandler<CommandType> | undefined,
  ][];
  for (const [commandType, handler] of entries) {
    if (!handler) continue;
    if (handlers.has(commandType)) {
      throw new Error(
        `Command "${commandType}" already has a handler; ${simModule.id} cannot claim it`,
      );
    }
    handlers.set(commandType, handler);
  }
}
