import type { GameRoomValue } from "@resync-game-framework/api";

/** JSON-safe command object accepted by the Descent realtime gateway. */
export type DescentWireCommand = { [key: string]: GameRoomValue } & {
  type: string;
};

type FieldKind = "boolean" | "number" | "string" | "stringArray";

interface CommandSchema {
  optional?: Readonly<Record<string, FieldKind>>;
  required?: Readonly<Record<string, FieldKind>>;
}

const IDS = (kind: FieldKind = "string") => kind;
const MOVE = {
  optional: { formation: IDS(), queue: IDS("boolean") },
  required: { unitIds: IDS("stringArray"), x: IDS("number"), y: IDS("number") },
} satisfies CommandSchema;

/** Strict command shapes used by the current Descent sim. */
const COMMAND_SCHEMAS: Readonly<Record<string, CommandSchema>> = {
  assign_build: {
    required: { buildingId: IDS(), unitIds: IDS("stringArray") },
  },
  assign_gather: {
    required: { nodeId: IDS(), unitIds: IDS("stringArray") },
  },
  brew_pill: { required: { furnaceId: IDS(), pillId: IDS() } },
  call_next_wave: {},
  cancel_training: { required: { buildingId: IDS(), jobId: IDS() } },
  choose_school: { required: { school: IDS(), unitId: IDS() } },
  descend: {},
  equip_treasure: { required: { treasureId: IDS(), unitId: IDS() } },
  feed_pill: { required: { pillId: IDS(), unitId: IDS() } },
  issue_rations: {
    required: { messHallId: IDS(), unitIds: IDS("stringArray") },
  },
  market_trade: {
    required: { amount: IDS("number"), buy: IDS(), sell: IDS() },
  },
  order_attack: {
    required: { targetId: IDS(), unitIds: IDS("stringArray") },
  },
  order_attack_move: MOVE,
  order_move: MOVE,
  order_stop: { required: { unitIds: IDS("stringArray") } },
  place_building: {
    optional: { builderIds: IDS("stringArray"), queue: IDS("boolean") },
    required: {
      buildingType: IDS(),
      x: IDS("number"),
      y: IDS("number"),
    },
  },
  recall_villagers: {},
  release_villagers: {},
  revive_hero: { required: { hallId: IDS(), heroId: IDS() } },
  set_formation: {
    required: { formation: IDS(), unitIds: IDS("stringArray") },
  },
  set_rally_point: {
    optional: { nodeId: IDS() },
    required: {
      buildingId: IDS(),
      x: IDS("number"),
      y: IDS("number"),
    },
  },
  start_breakthrough: {
    optional: { hallId: IDS() },
    required: { unitId: IDS() },
  },
  summon_calamity: { required: { altarId: IDS(), calamityId: IDS() } },
  train_hero: { required: { hallId: IDS(), heroId: IDS() } },
  train_unit: {
    optional: { count: IDS("number") },
    required: { buildingId: IDS(), classId: IDS() },
  },
  upgrade_hold: {},
};

const FORMATIONS = new Set(["column", "line", "ranks", "wedge"]);
const TRAINABLE_CLASSES = new Set([
  "adept",
  "breaker",
  "hunter",
  "raider",
  "rider",
  "villager",
  "warden",
]);
const RESOURCES = new Set([
  "coin",
  "essence",
  "food",
  "iron",
  "spirit_herbs",
  "stone",
  "water",
  "wood",
]);
const SCHOOLS = new Set(["blood", "ember", "rime"]);

/**
 * Validates the complete wire shape of a Descent command. Unknown fields are
 * rejected so payload size and the values reaching every client's sim stay
 * bounded and deterministic.
 * @param value - Candidate command from a socket client
 * @returns Whether the command is safe to stamp and broadcast
 */
export function isDescentWireCommand(
  value: unknown,
): value is DescentWireCommand {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (!hasOwn(COMMAND_SCHEMAS, value.type)) return false;
  const schema = COMMAND_SCHEMAS[value.type];
  if (!schema) return false;
  const fields = { ...schema.optional, ...schema.required };
  for (const key of Object.keys(value)) {
    if (key === "type") continue;
    if (!hasOwn(fields, key)) return false;
    const kind = fields[key];
    if (kind === undefined || !validField(key, value[key], kind)) return false;
  }
  for (const [key, kind] of Object.entries(schema.required ?? {})) {
    if (!(key in value) || !validField(key, value[key], kind)) return false;
  }
  return validEnums(value as DescentWireCommand);
}

/**
 * Checks one scalar or string-array field.
 * @param key - Field name, used for numeric bounds
 * @param value - Field value
 * @param kind - Expected wire type
 * @returns Whether the value matches and is bounded
 */
function validField(key: string, value: unknown, kind: FieldKind): boolean {
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "string") {
    return typeof value === "string" && value.length > 0 && value.length <= 128;
  }
  if (kind === "stringArray") {
    return (
      Array.isArray(value) &&
      value.length <= 512 &&
      value.every(
        (entry) =>
          typeof entry === "string" && entry.length > 0 && entry.length <= 128,
      )
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (key === "count") {
    return Number.isSafeInteger(value) && value >= 1 && value <= 5;
  }
  if (key === "amount") {
    return Number.isSafeInteger(value) && value > 0 && value <= 100_000;
  }
  return Math.abs(value) <= 10_000;
}

/**
 * Validates enum-valued fields whose invalid values could throw in sim rules.
 * @param command - Structurally valid command
 * @returns Whether all enum values are supported
 */
function validEnums(command: DescentWireCommand): boolean {
  if ("formation" in command) {
    return (
      typeof command.formation === "string" && FORMATIONS.has(command.formation)
    );
  }
  if (command.type === "train_unit") {
    return (
      typeof command.classId === "string" &&
      TRAINABLE_CLASSES.has(command.classId)
    );
  }
  if (command.type === "market_trade") {
    return (
      typeof command.sell === "string" &&
      typeof command.buy === "string" &&
      RESOURCES.has(command.sell) &&
      RESOURCES.has(command.buy)
    );
  }
  if (command.type === "choose_school") {
    return typeof command.school === "string" && SCHOOLS.has(command.school);
  }
  return true;
}

/**
 * Checks an own key without accepting Object.prototype members.
 * @param record - Object to inspect
 * @param key - Candidate own key
 * @returns Whether the key exists directly on the object
 */
function hasOwn(record: object, key: string): boolean {
  return Object.prototype.propertyIsEnumerable.call(record, key);
}

/**
 * Checks for a non-array object without invoking getters or prototypes.
 * @param value - Candidate value
 * @returns Whether it is a record
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
