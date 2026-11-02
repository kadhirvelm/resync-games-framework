import { RESOURCE_IDS, type StampedCommand } from "../types";
import { isSimSpeed, SIM_SAVE_FORMAT, SIM_SAVE_VERSION } from "./constants";
import type { SimWorldState } from "./world";

/** Raised when a serialized sim cannot be read. */
export class DescentSaveError extends Error {
  /** @param message - Why the save was rejected */
  constructor(message: string) {
    super(message);
    this.name = "DescentSaveError";
  }
}

/** Upgrades the state written by one version to the next version's shape. */
export type SimSaveMigration = (state: unknown) => unknown;

/**
 * Migrations keyed by the version they upgrade *from*. When
 * `SIM_SAVE_VERSION` becomes 2, add `1: (state) => …` here.
 */
export const SIM_SAVE_MIGRATIONS: Readonly<Record<number, SimSaveMigration>> =
  {};

/**
 * Serializes the full world in the versioned envelope.
 * @param world - World to write
 * @returns A JSON string `{ format, state, version }`
 */
export function serializeWorld(world: SimWorldState): string {
  return JSON.stringify({
    format: SIM_SAVE_FORMAT,
    state: world,
    version: SIM_SAVE_VERSION,
  });
}

/**
 * Reads, migrates, and validates a serialized sim.
 * @param serialized - Output of `serializeWorld`, possibly from an older version
 * @param migrations - Migration table; defaults to `SIM_SAVE_MIGRATIONS`
 * @returns A fresh world state safe to mutate
 * @throws DescentSaveError when the save is malformed or from a newer version
 */
export function parseSerializedWorld(
  serialized: string,
  migrations: Readonly<Record<number, SimSaveMigration>> = SIM_SAVE_MIGRATIONS,
): SimWorldState {
  const envelope = parseJson(serialized);
  if (!isRecord(envelope) || envelope.format !== SIM_SAVE_FORMAT) {
    throw new DescentSaveError("Not a Descent sim save");
  }
  const { version } = envelope;
  if (!Number.isInteger(version) || (version as number) < 0) {
    throw new DescentSaveError("Descent save has no valid version");
  }
  if ((version as number) > SIM_SAVE_VERSION) {
    throw new DescentSaveError(
      `Descent save version ${version} is newer than ${SIM_SAVE_VERSION}`,
    );
  }
  let state: unknown = envelope.state;
  for (let from = version as number; from < SIM_SAVE_VERSION; from += 1) {
    const migrate = migrations[from];
    if (!migrate) {
      throw new DescentSaveError(`No migration from save version ${from}`);
    }
    state = migrate(state);
  }
  return validateWorldState(state);
}

/**
 * Parses JSON, converting syntax errors to save errors.
 * @param serialized - Raw text
 * @returns The parsed value
 */
function parseJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch {
    throw new DescentSaveError("Descent save is not valid JSON");
  }
}

/**
 * @param value - Any value
 * @returns Whether the value is a plain non-array object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param value - Any value
 * @returns Whether the value is a non-negative safe integer
 */
function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * @param value - Any value
 * @returns Whether the value is an unsigned 32-bit integer
 */
function isUint32(value: unknown): value is number {
  return isCount(value) && value <= 0xffffffff;
}

/**
 * @param value - Any value
 * @returns Whether the value has the stamped-command envelope
 */
function isStampedCommand(value: unknown): value is StampedCommand {
  return (
    isRecord(value) &&
    isCount(value.tick) &&
    isCount(value.seq) &&
    isRecord(value.command) &&
    typeof value.command.type === "string"
  );
}

/**
 * Throws a save error naming the bad field.
 * @param condition - Check that must hold
 * @param field - Field reported when it fails
 */
function ensure(condition: boolean, field: string): asserts condition {
  if (!condition) {
    throw new DescentSaveError(`Descent save has an invalid ${field}`);
  }
}

/**
 * Checks the current-version world shape. Module-owned fields inside units,
 * buildings, and `meta` are left to their modules.
 * @param state - Migrated state
 * @returns The same object, typed
 */
function validateWorldState(state: unknown): SimWorldState {
  ensure(isRecord(state), "state");
  ensure(isCount(state.tick), "tick");
  ensure(isUint32(state.seed), "seed");
  ensure(isUint32(state.rngState), "rngState");
  ensure(isCount(state.commandSeq), "commandSeq");
  ensure(isCount(state.nextEntitySeq), "nextEntitySeq");
  ensure(typeof state.paused === "boolean", "paused");
  ensure(typeof state.speed === "number" && isSimSpeed(state.speed), "speed");
  ensure(
    state.layerId === null || typeof state.layerId === "string",
    "layerId",
  );
  ensure(
    isRecord(state.map) &&
      typeof state.map.width === "number" &&
      typeof state.map.height === "number" &&
      state.map.width > 0 &&
      state.map.height > 0,
    "map",
  );
  const { resources } = state;
  ensure(
    isRecord(resources) &&
      RESOURCE_IDS.every((id) => Number.isFinite(resources[id])),
    "resources",
  );
  ensure(Array.isArray(state.units), "units");
  ensure(Array.isArray(state.buildings), "buildings");
  ensure(
    Array.isArray(state.pendingCommands) &&
      state.pendingCommands.every(isStampedCommand),
    "pendingCommands",
  );
  ensure(isRecord(state.meta), "meta");
  return state as unknown as SimWorldState;
}
