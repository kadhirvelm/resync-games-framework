import rawLayerTable from "../../data/layers.json";
import type {
  CircleVolume,
  HazardAnswers,
  HazardConfig,
  HazardId,
  HazardRotation,
  LayerConfig,
  LayerId,
  LayerTable,
  RankTitle,
  SchoolEffectKind,
  SchoolId,
} from "./layerTypes";

/** Rank titles from weakest to strongest (shared contract order). */
export const RANK_ORDER: readonly RankTitle[] = [
  "Ashborn",
  "Sworn",
  "Veteran",
  "Champion",
  "Ascended",
];

const LAYER_IDS: readonly LayerId[] = [
  "ashen_gate",
  "bone_wastes",
  "frozen_pit",
  "blood_sea",
  "throne_of_hell",
];
const HAZARD_IDS: readonly HazardId[] = [
  "ember_vents",
  "fog",
  "cold",
  "lifedrain",
];
const SCHOOL_IDS: readonly SchoolId[] = ["ember", "rime", "blood"];
const SCHOOL_EFFECTS: readonly SchoolEffectKind[] = [
  "effect_damage",
  "lifesteal",
  "shield",
  "none",
];

type JsonRecord = Record<string, unknown>;

/**
 * Throws a descriptive error for malformed layer data.
 * @param path - Dotted location of the bad value.
 * @param expected - What the value should have been.
 * @returns Never returns.
 */
function fail(path: string, expected: string): never {
  throw new Error(`layers.json: ${path} must be ${expected}`);
}

/**
 * Narrows a value to a plain object.
 * @param value - Raw JSON value.
 * @param path - Location for error messages.
 * @returns The value as a record.
 */
function readRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "an object");
  }
  return value as JsonRecord;
}

/**
 * Narrows a value to an array.
 * @param value - Raw JSON value.
 * @param path - Location for error messages.
 * @returns The value as an array.
 */
function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    return fail(path, "an array");
  }
  return value;
}

/**
 * Narrows a value to a finite number at or above a minimum.
 * @param value - Raw JSON value.
 * @param path - Location for error messages.
 * @param minimum - Smallest allowed value (inclusive).
 * @returns The number.
 */
function readNumber(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    return fail(path, `a number >= ${minimum}`);
  }
  return value;
}

/**
 * Narrows a value to a non-empty string.
 * @param value - Raw JSON value.
 * @param path - Location for error messages.
 * @returns The string.
 */
function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fail(path, "a non-empty string");
  }
  return value;
}

/**
 * Narrows a value to one member of a string union.
 * @param value - Raw JSON value.
 * @param allowed - The union's members.
 * @param path - Location for error messages.
 * @returns The matching member.
 */
function readOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    return fail(path, `one of ${allowed.join(", ")}`);
  }
  return match;
}

/**
 * Parses a fraction in [0, 1].
 * @param value - Raw JSON value.
 * @param path - Location for error messages.
 * @returns The fraction.
 */
function readFraction(value: unknown, path: string): number {
  const fraction = readNumber(value, path);
  if (fraction > 1) {
    return fail(path, "a number between 0 and 1");
  }
  return fraction;
}

/**
 * Parses one hazard definition.
 * @param raw - Raw hazard JSON.
 * @param id - The hazard table key; must match `kind`.
 * @returns The typed hazard.
 */
function parseHazard(raw: unknown, id: HazardId): HazardConfig {
  const path = `hazards.${id}`;
  const record = readRecord(raw, path);
  const kind = readOneOf(record.kind, [id], `${path}.kind`);
  switch (kind) {
    case "ember_vents":
      return {
        burnPerSecond: readNumber(
          record.burnPerSecond,
          `${path}.burnPerSecond`,
        ),
        fireWardMitigation: readFraction(
          record.fireWardMitigation,
          `${path}.fireWardMitigation`,
        ),
        kind,
      };
    case "fog":
      return {
        kind,
        visionMultiplier: readNumber(
          record.visionMultiplier,
          `${path}.visionMultiplier`,
        ),
      };
    case "cold":
      return {
        gatherMultiplier: readNumber(
          record.gatherMultiplier,
          `${path}.gatherMultiplier`,
        ),
        kind,
        moveMultiplier: readNumber(
          record.moveMultiplier,
          `${path}.moveMultiplier`,
        ),
      };
    case "lifedrain":
      return {
        essencePerKill: readNumber(
          record.essencePerKill,
          `${path}.essencePerKill`,
        ),
        healingMultiplier: readNumber(
          record.healingMultiplier,
          `${path}.healingMultiplier`,
        ),
        immuneSchool: readOneOf(
          record.immuneSchool,
          SCHOOL_IDS,
          `${path}.immuneSchool`,
        ),
        kind,
      };
  }
}

/**
 * Parses a building type plus coverage radius.
 * @param raw - Raw answer JSON.
 * @param path - Location for error messages.
 * @returns The building type and radius.
 */
function parseCoverage(
  raw: unknown,
  path: string,
): { buildingType: string; radius: number } {
  const record = readRecord(raw, path);
  return {
    buildingType: readString(record.buildingType, `${path}.buildingType`),
    radius: readNumber(record.radius, `${path}.radius`),
  };
}

/**
 * Parses the buildable hazard answers.
 * @param raw - Raw `answers` JSON.
 * @returns Typed answers.
 */
function parseAnswers(raw: unknown): HazardAnswers {
  const record = readRecord(raw, "answers");
  const omen = readRecord(record.omenTower, "answers.omenTower");
  return {
    fireWardWall: parseCoverage(record.fireWardWall, "answers.fireWardWall"),
    hearthWard: parseCoverage(record.hearthWard, "answers.hearthWard"),
    omenTower: {
      ...parseCoverage(omen, "answers.omenTower"),
      rangeUpgrade: readString(
        omen.rangeUpgrade,
        "answers.omenTower.rangeUpgrade",
      ),
      upgradedRadius: readNumber(
        omen.upgradedRadius,
        "answers.omenTower.upgradedRadius",
      ),
    },
    wardTower: parseCoverage(record.wardTower, "answers.wardTower"),
  };
}

/**
 * Parses a circular map volume.
 * @param raw - Raw volume JSON.
 * @param path - Location for error messages.
 * @returns The volume.
 */
function parseVolume(raw: unknown, path: string): CircleVolume {
  const record = readRecord(raw, path);
  return {
    radius: readNumber(record.radius, `${path}.radius`),
    x: readNumber(record.x, `${path}.x`, Number.NEGATIVE_INFINITY),
    y: readNumber(record.y, `${path}.y`, Number.NEGATIVE_INFINITY),
  };
}

/**
 * Parses an optional hazard rotation.
 * @param raw - Raw rotation JSON or null.
 * @param path - Location for error messages.
 * @returns The rotation, or null when the layer does not rotate.
 */
function parseRotation(raw: unknown, path: string): HazardRotation | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const record = readRecord(raw, path);
  const hazards = readArray(record.hazards, `${path}.hazards`).map(
    (hazard, index) =>
      readOneOf(hazard, HAZARD_IDS, `${path}.hazards.${index}`),
  );
  if (hazards.length === 0) {
    return fail(`${path}.hazards`, "non-empty");
  }
  return {
    hazards,
    periodSeconds: readNumber(record.periodSeconds, `${path}.periodSeconds`, 1),
  };
}

/**
 * Parses per-school modifiers; every school must be present.
 * @param raw - Raw modifiers JSON.
 * @param path - Location for error messages.
 * @returns A complete school → multiplier record.
 */
function parseSchoolModifiers(
  raw: unknown,
  path: string,
): Record<SchoolId, number> {
  const record = readRecord(raw, path);
  return {
    blood: readNumber(record.blood, `${path}.blood`),
    ember: readNumber(record.ember, `${path}.ember`),
    rime: readNumber(record.rime, `${path}.rime`),
  };
}

/**
 * Parses one layer row.
 * @param raw - Raw layer JSON.
 * @param index - Row index for error messages.
 * @returns The typed layer config.
 */
function parseLayer(raw: unknown, index: number): LayerConfig {
  const path = `layers.${index}`;
  const record = readRecord(raw, path);
  const hazards = readArray(record.hazards, `${path}.hazards`).map(
    (hazard, hazardIndex) =>
      readOneOf(hazard, HAZARD_IDS, `${path}.hazards.${hazardIndex}`),
  );
  const hazardRotation = parseRotation(
    record.hazardRotation,
    `${path}.hazardRotation`,
  );
  if (hazards.length > 0 && hazardRotation !== null) {
    return fail(path, "either fixed hazards or a hazardRotation, not both");
  }
  return {
    bossName: readString(record.bossName, `${path}.bossName`),
    bossTitle: readString(record.bossTitle, `${path}.bossTitle`),
    essenceGrade: readNumber(record.essenceGrade, `${path}.essenceGrade`, 1),
    faction: readString(record.faction, `${path}.faction`),
    favoredEffect: readOneOf(
      record.favoredEffect,
      SCHOOL_EFFECTS,
      `${path}.favoredEffect`,
    ),
    hazardRotation,
    hazards,
    id: readOneOf(record.id, LAYER_IDS, `${path}.id`),
    loreBeat: readString(record.loreBeat, `${path}.loreBeat`),
    name: readString(record.name, `${path}.name`),
    order: readNumber(record.order, `${path}.order`, 1),
    realmCap: readOneOf(record.realmCap, RANK_ORDER, `${path}.realmCap`),
    schoolModifiers: parseSchoolModifiers(
      record.schoolModifiers,
      `${path}.schoolModifiers`,
    ),
    unlocks: readArray(record.unlocks, `${path}.unlocks`).map(
      (unlock, unlockIndex) =>
        readString(unlock, `${path}.unlocks.${unlockIndex}`),
    ),
    ventVolumes: readArray(record.ventVolumes, `${path}.ventVolumes`).map(
      (volume, volumeIndex) =>
        parseVolume(volume, `${path}.ventVolumes.${volumeIndex}`),
    ),
  };
}

/**
 * Validates raw layer JSON and returns a typed table with layers sorted by
 * descent order. Throws on any malformed or missing field.
 * @param raw - The parsed `layers.json` contents.
 * @returns The typed layer table.
 */
export function parseLayerTable(raw: unknown): LayerTable {
  const record = readRecord(raw, "root");
  const hazardRecord = readRecord(record.hazards, "hazards");
  const hazards = {
    cold: parseHazard(hazardRecord.cold, "cold"),
    ember_vents: parseHazard(hazardRecord.ember_vents, "ember_vents"),
    fog: parseHazard(hazardRecord.fog, "fog"),
    lifedrain: parseHazard(hazardRecord.lifedrain, "lifedrain"),
  };
  const layers = readArray(record.layers, "layers")
    .map(parseLayer)
    .sort((left, right) => left.order - right.order);
  if (layers.length === 0) {
    return fail("layers", "non-empty");
  }
  const uniqueIds = new Set(layers.map((layer) => layer.id));
  if (uniqueIds.size !== layers.length) {
    return fail("layers", "free of duplicate ids");
  }
  return {
    answers: parseAnswers(record.answers),
    hazards,
    layers,
    version: readNumber(record.version, "version", 1),
  };
}

/** The validated MVP layer table from `data/layers.json`. */
export const LAYER_TABLE: LayerTable = parseLayerTable(rawLayerTable);

/**
 * Returns the 0-based ladder position of a rank title.
 * @param rank - Rank title to look up.
 * @returns Its index in {@link RANK_ORDER}.
 */
export function rankIndex(rank: RankTitle): number {
  return RANK_ORDER.indexOf(rank);
}

/**
 * Reports whether a rank is at or below a cap.
 * @param rank - Rank a unit holds or wants to reach.
 * @param cap - The layer's realm cap.
 * @returns True when `rank` does not exceed `cap`.
 */
export function isRankWithinCap(rank: RankTitle, cap: RankTitle): boolean {
  return rankIndex(rank) <= rankIndex(cap);
}
