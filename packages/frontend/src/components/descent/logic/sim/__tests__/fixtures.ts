import type { Command } from "../../types";
import type { DescentSim } from "../descentSim";
import type { SimModule } from "../modules";

/** A command scheduled for the tick index it should be stamped on. */
export interface ScriptedCommand {
  command: Command;
  tick: number;
}

/**
 * Test-only module that exercises commands, RNG, entity ids, layer starts,
 * and module meta, so determinism checks cover every seam.
 */
export const sandboxModule: SimModule = {
  commands: {
    descend(_command, context) {
      const depth = (context.world.meta.sandbox as { depth: number }).depth + 1;
      (context.world.meta.sandbox as { depth: number }).depth = depth;
      context.startLayer(`layer-${depth}`);
    },
    order_move(command, context) {
      for (const unit of context.world.units) {
        if (!command.unitIds.includes(unit.id)) continue;
        unit.x = command.x;
        unit.y = command.y;
      }
    },
    place_building(command, context) {
      context.world.buildings.push({
        buildingType: command.buildingType,
        id: context.nextEntityId("building"),
        x: command.x,
        y: command.y,
      });
    },
    train_unit(command, context) {
      context.world.units.push({
        classId: command.classId,
        id: context.nextEntityId("unit"),
        x: context.rng.int(0, context.world.map.width - 1),
        y: context.rng.int(0, context.world.map.height - 1),
      });
    },
  },
  id: "sandbox",
  init(world) {
    world.meta.sandbox = { depth: 0 };
  },
  processors: [
    {
      id: "sandbox-income",
      phase: "economy",
      run(context) {
        context.world.resources.essence += context.rng.int(0, 3);
      },
    },
    {
      id: "sandbox-drift",
      phase: "combat",
      run(context) {
        for (const unit of context.world.units) {
          unit.x += context.rng.next() < 0.5 ? -1 : 1;
        }
      },
    },
  ],
};

/** A fixed command script spanning several ticks. */
export const SANDBOX_SCRIPT: readonly ScriptedCommand[] = [
  {
    command: { buildingType: "Barracks", type: "place_building", x: 4, y: 6 },
    tick: 0,
  },
  {
    command: {
      buildingId: "building-1",
      classId: "warden",
      type: "train_unit",
    },
    tick: 2,
  },
  {
    command: {
      buildingId: "building-1",
      classId: "hunter",
      type: "train_unit",
    },
    tick: 2,
  },
  { command: { type: "descend" }, tick: 5 },
  {
    command: { type: "order_move", unitIds: ["unit-2"], x: 10, y: 12 },
    tick: 9,
  },
  {
    command: { buildingId: "building-1", classId: "adept", type: "train_unit" },
    tick: 14,
  },
  { command: { type: "descend" }, tick: 20 },
];

/**
 * Plays a script one tick at a time, enqueuing each command on its tick.
 * @param sim - Sim to drive
 * @param script - Commands keyed by stamp tick
 * @param ticks - Total ticks to advance
 */
export function runScript(
  sim: DescentSim,
  script: readonly ScriptedCommand[],
  ticks: number,
): void {
  for (let index = 0; index < ticks; index += 1) {
    for (const entry of script) {
      if (entry.tick === sim.tick) sim.enqueue(entry.command);
    }
    sim.step(1);
  }
}

/**
 * In-memory `Storage` stand-in.
 * @returns A storage object and its backing map
 */
export function createMemoryStorage(): {
  storage: Pick<Storage, "getItem" | "setItem">;
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
    values,
  };
}

/**
 * Runs a callback that should throw and returns what it threw.
 * @param callback - Code expected to throw
 * @returns The thrown error
 * @throws If the callback returns normally
 */
export function captureError(callback: () => unknown): Error {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`Threw a non-Error: ${String(error)}`);
  }
  throw new Error("Expected the callback to throw");
}
