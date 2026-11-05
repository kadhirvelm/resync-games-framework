import bossData from "../../data/bosses.json";
import calamityData from "../../data/calamities.json";
import type { NarrativeBossId } from "../../data/narrative/types";
import treasureData from "../../data/treasures.json";
import waveData from "../../data/waves.json";
import type { CombatClassId } from "../combat/types";
import { LAYER_TABLE } from "../layers/layerTable";
import type { HazardId, LayerId } from "../layers/layerTypes";
import type {
  BossDefinition,
  BossPhase,
  BossTwist,
  ClassCount,
  EliteAffixId,
  WaveDefinition,
  WaveSchedule,
  WaveType,
} from "./types";

/** Building type the economy places and the omen readout watches. */
export const OMEN_TOWER_BUILDING_TYPE =
  LAYER_TABLE.answers.omenTower.buildingType;

/** Boss id to the layer that fights them. Exhaustive over the narrative ids. */
const BOSS_LAYER: Record<NarrativeBossId, LayerId> = {
  cinderjaw: "ashen_gate",
  marshal_orrec_vane: "bone_wastes",
  maw_of_tides: "blood_sea",
  queen_isolde: "frozen_pit",
  warden_of_layers: "throne_of_hell",
};

const COMBAT_CLASSES: readonly CombatClassId[] = [
  "warden",
  "hunter",
  "rider",
  "raider",
  "breaker",
  "adept",
];

const WAVE_TYPES: readonly WaveType[] = ["scout", "swarm", "elite", "boss"];

const AFFIXES: readonly EliteAffixId[] = [
  "armored",
  "summoner",
  "berserker",
  "siphon",
];

const TWISTS: readonly BossTwist[] = [
  "imps_from_vents",
  "arena_fog",
  "mobility",
  "freezing_ground",
  "hunger",
  "rotate_rule",
];

const HAZARDS: readonly HazardId[] = [
  "ember_vents",
  "fog",
  "cold",
  "lifedrain",
];

type JsonRecord = Record<string, unknown>;

/** Item id every boss drops; the Calamity Altar consumes this id. */
export const BOSS_CORE_ITEM_ID: string = calamityData.bossCoreItemId;

/** Treasure ids a boss may offer, read from the treasure catalog. */
const TREASURE_IDS: ReadonlySet<string> = new Set(
  treasureData.map((treasure) => treasure.id),
);

/**
 * Throws a catalog error.
 * @param path - Dotted location of the bad value
 * @param expected - What the value should have been
 * @returns Never
 */
function fail(path: string, expected: string): never {
  throw new Error(`${path} must be ${expected}`);
}

/**
 * Narrows a JSON value to an object.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The object
 */
function readRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "an object");
  }
  return value as JsonRecord;
}

/**
 * Narrows a JSON value to an array.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The array
 */
function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, "an array");
  return value;
}

/**
 * Reads a finite number.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The number
 */
function readNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "a finite number");
  }
  return value;
}

/**
 * Reads a positive integer.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The integer
 */
function readPositiveInt(value: unknown, path: string): number {
  const parsed = readNumber(value, path);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fail(path, "a positive integer");
  }
  return parsed;
}

/**
 * Reads a non-empty string.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The string
 */
function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fail(path, "a non-empty string");
  }
  return value;
}

/**
 * Reads a boolean.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The boolean
 */
function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return fail(path, "a boolean");
  return value;
}

/**
 * Reads a combat class id.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The class id
 */
function readClassId(value: unknown, path: string): CombatClassId {
  const text = readString(value, path);
  if (!COMBAT_CLASSES.includes(text as CombatClassId)) {
    return fail(path, `one of ${COMBAT_CLASSES.join(", ")}`);
  }
  return text as CombatClassId;
}

/**
 * Reads a layer id.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The layer id
 */
function readLayerId(value: unknown, path: string): LayerId {
  const text = readString(value, path);
  const known = LAYER_TABLE.layers.some((layer) => layer.id === text);
  if (!known) return fail(path, "a known layer id");
  return text as LayerId;
}

/**
 * Reads a narrative boss id.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The boss id
 */
function readBossId(value: unknown, path: string): NarrativeBossId {
  const text = readString(value, path);
  if (!(text in BOSS_LAYER)) return fail(path, "a known boss id");
  return text as NarrativeBossId;
}

/**
 * Reads one class count.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The count
 */
function readClassCount(value: unknown, path: string): ClassCount {
  const record = readRecord(value, path);
  const classCount: ClassCount = {
    classId: readClassId(record.classId, `${path}.classId`),
    count: readPositiveInt(record.count, `${path}.count`),
  };
  const statScale = readOptionalNumber(record.statScale, `${path}.statScale`);
  if (statScale === null) return classCount;
  if (!(statScale > 0)) return fail(`${path}.statScale`, "a positive number");
  return { ...classCount, statScale };
}

/**
 * Reads a list of class counts.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The counts, which may be empty
 */
function readComposition(value: unknown, path: string): ClassCount[] {
  return readArray(value, path).map((entry, index) =>
    readClassCount(entry, `${path}.${index}`),
  );
}

/**
 * Reads one boss phase and checks the fields its twist needs.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The phase
 */
function readPhase(value: unknown, path: string): BossPhase {
  const record = readRecord(value, path);
  const twistText = readString(record.twist, `${path}.twist`);
  if (!TWISTS.includes(twistText as BossTwist)) {
    return fail(`${path}.twist`, `one of ${TWISTS.join(", ")}`);
  }
  const twist = twistText as BossTwist;
  const spawn =
    record.spawn === undefined
      ? []
      : readComposition(record.spawn, `${path}.spawn`);
  const rotatedRule =
    record.rotatedRule === undefined
      ? null
      : readHazard(record.rotatedRule, `${path}.rotatedRule`);
  const phase: BossPhase = {
    damageMultiplier: readOptionalNumber(
      record.damageMultiplier,
      `${path}.damageMultiplier`,
    ),
    id: readString(record.id, `${path}.id`),
    rotatedRule,
    spawn,
    speedMultiplier: readOptionalNumber(
      record.speedMultiplier,
      `${path}.speedMultiplier`,
    ),
    threshold: readNumber(record.threshold, `${path}.threshold`),
    twist,
    visionMultiplier: readOptionalNumber(
      record.visionMultiplier,
      `${path}.visionMultiplier`,
    ),
  };
  if (phase.threshold <= 0 || phase.threshold >= 1) {
    return fail(`${path}.threshold`, "between 0 and 1");
  }
  if (twist === "imps_from_vents" && spawn.length === 0) {
    return fail(`${path}.spawn`, "at least one class count");
  }
  if (twist === "rotate_rule" && rotatedRule === null) {
    return fail(`${path}.rotatedRule`, "a layer hazard id");
  }
  if (twist === "arena_fog" && phase.visionMultiplier === null) {
    return fail(`${path}.visionMultiplier`, "a number");
  }
  if (twist === "mobility" && phase.speedMultiplier === null) {
    return fail(`${path}.speedMultiplier`, "a number");
  }
  if (twist === "hunger" && phase.damageMultiplier === null) {
    return fail(`${path}.damageMultiplier`, "a number");
  }
  return phase;
}

/**
 * Reads an optional finite number.
 * @param value - Raw JSON value or undefined
 * @param path - Location for the error
 * @returns The number, or null when the field is absent
 */
function readOptionalNumber(value: unknown, path: string): number | null {
  if (value === undefined) return null;
  return readNumber(value, path);
}

/**
 * Reads a layer hazard id.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The hazard id
 */
function readHazard(value: unknown, path: string): HazardId {
  const text = readString(value, path);
  if (!HAZARDS.includes(text as HazardId)) {
    return fail(path, `one of ${HAZARDS.join(", ")}`);
  }
  return text as HazardId;
}

/**
 * Reads one boss and checks its name against the layer table.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The boss
 */
function readBoss(value: unknown, path: string): BossDefinition {
  const record = readRecord(value, path);
  const id = readBossId(record.id, `${path}.id`);
  const layerId = readLayerId(record.layerId, `${path}.layerId`);
  if (BOSS_LAYER[id] !== layerId) {
    return fail(`${path}.layerId`, BOSS_LAYER[id]);
  }
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === layerId);
  if (!layer) return fail(`${path}.layerId`, "a known layer id");
  const name = readString(record.name, `${path}.name`);
  const title = readString(record.title, `${path}.title`);
  if (name !== layer.bossName) return fail(`${path}.name`, layer.bossName);
  if (title !== layer.bossTitle) return fail(`${path}.title`, layer.bossTitle);
  const phases = readArray(record.phases, `${path}.phases`).map(
    (entry, index) => readPhase(entry, `${path}.phases.${index}`),
  );
  if (phases.length === 0) return fail(`${path}.phases`, "at least one phase");
  const phaseIds = new Set<string>();
  for (const phase of phases) {
    if (phaseIds.has(phase.id))
      return fail(`${path}.phases`, "unique phase ids");
    phaseIds.add(phase.id);
  }
  phases.sort((left, right) => right.threshold - left.threshold);
  const treasureChoice = readArray(
    record.treasureChoice,
    `${path}.treasureChoice`,
  ).map((entry, index) =>
    readTreasureId(entry, `${path}.treasureChoice.${index}`),
  );
  if (treasureChoice.length < 2) {
    return fail(`${path}.treasureChoice`, "at least two ids");
  }
  const bossCoreId = readString(record.bossCoreId, `${path}.bossCoreId`);
  if (bossCoreId !== BOSS_CORE_ITEM_ID) {
    return fail(`${path}.bossCoreId`, BOSS_CORE_ITEM_ID);
  }
  const school =
    record.school === undefined
      ? null
      : readSchool(record.school, `${path}.school`);
  return {
    allyDeathHealFraction: readNumber(
      record.allyDeathHealFraction,
      `${path}.allyDeathHealFraction`,
    ),
    aoeRadius:
      record.aoeRadius === undefined
        ? null
        : readNumber(record.aoeRadius, `${path}.aoeRadius`),
    armor: readNumber(record.armor, `${path}.armor`),
    bossCoreId,
    classId: readClassId(record.classId, `${path}.classId`),
    damage: readNumber(record.damage, `${path}.damage`),
    essenceBase: readPositiveInt(record.essenceBase, `${path}.essenceBase`),
    id,
    layerId,
    lifesteal: readBoolean(record.lifesteal, `${path}.lifesteal`),
    maxHitPoints: readPositiveInt(record.maxHitPoints, `${path}.maxHitPoints`),
    name,
    phases,
    school,
    speed: readNumber(record.speed, `${path}.speed`),
    title,
    treasureChoice,
    vision: readNumber(record.vision, `${path}.vision`),
    windupSeconds: readPositiveInt(
      record.windupSeconds,
      `${path}.windupSeconds`,
    ),
  };
}

/**
 * Reads a treasure id that exists in `treasures.json`.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The treasure id
 */
function readTreasureId(value: unknown, path: string): string {
  const text = readString(value, path);
  if (!TREASURE_IDS.has(text)) return fail(path, "a treasures.json id");
  return text;
}

/**
 * Reads a school id.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The school
 */
function readSchool(value: unknown, path: string): "ember" | "rime" | "blood" {
  const text = readString(value, path);
  if (text !== "ember" && text !== "rime" && text !== "blood") {
    return fail(path, "ember, rime, or blood");
  }
  return text;
}

/**
 * Reads one wave.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @param layerId - Layer that owns the wave
 * @returns The wave
 */
function readWave(
  value: unknown,
  path: string,
  layerId: LayerId,
): WaveDefinition {
  const record = readRecord(value, path);
  const typeText = readString(record.type, `${path}.type`);
  if (!WAVE_TYPES.includes(typeText as WaveType)) {
    return fail(`${path}.type`, `one of ${WAVE_TYPES.join(", ")}`);
  }
  const type = typeText as WaveType;
  const composition = readComposition(
    record.composition,
    `${path}.composition`,
  );
  const elite =
    record.elite === undefined
      ? null
      : readElite(record.elite, `${path}.elite`);
  const bossId =
    record.bossId === undefined
      ? null
      : readBossId(record.bossId, `${path}.bossId`);
  if (type === "elite" && elite === null) {
    return fail(`${path}.elite`, "present on an elite wave");
  }
  if (type !== "elite" && elite !== null) {
    return fail(`${path}.elite`, "omitted unless the wave is elite");
  }
  if (type === "boss" && bossId === null) {
    return fail(`${path}.bossId`, "present on a boss wave");
  }
  if (type !== "boss" && bossId !== null) {
    return fail(`${path}.bossId`, "omitted unless the wave is boss");
  }
  if (bossId !== null && BOSS_LAYER[bossId] !== layerId) {
    return fail(`${path}.bossId`, `the boss of ${layerId}`);
  }
  const bodies = composition.reduce((total, group) => total + group.count, 0);
  if (type !== "boss" && bodies + (elite ? 1 : 0) < 1) {
    return fail(`${path}.composition`, "at least one body");
  }
  return {
    bossId,
    composition,
    elite,
    id: readString(record.id, `${path}.id`),
    spawnAtSeconds: readPositiveInt(
      record.spawnAtSeconds,
      `${path}.spawnAtSeconds`,
    ),
    type,
  };
}

/**
 * Reads an elite affix assignment.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The elite
 */
function readElite(
  value: unknown,
  path: string,
): { affix: EliteAffixId; classId: CombatClassId } {
  const record = readRecord(value, path);
  const affixText = readString(record.affix, `${path}.affix`);
  if (!AFFIXES.includes(affixText as EliteAffixId)) {
    return fail(`${path}.affix`, `one of ${AFFIXES.join(", ")}`);
  }
  return {
    affix: affixText as EliteAffixId,
    classId: readClassId(record.classId, `${path}.classId`),
  };
}

/**
 * Reads one layer schedule.
 * @param value - Raw JSON value
 * @param path - Location for the error
 * @returns The schedule
 */
function readSchedule(value: unknown, path: string): WaveSchedule {
  const record = readRecord(value, path);
  const id = readLayerId(record.id, `${path}.id`);
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === id);
  if (!layer) return fail(`${path}.id`, "a known layer id");
  const portion = readNumber(
    record.siegeSwarmPortion,
    `${path}.siegeSwarmPortion`,
  );
  if (portion < 0 || portion > 1) {
    return fail(`${path}.siegeSwarmPortion`, "from 0 to 1");
  }
  if (layer.order >= 3 && portion <= 0) {
    return fail(`${path}.siegeSwarmPortion`, "above 0 from the Frozen Pit on");
  }
  if (layer.order < 3 && portion !== 0) {
    return fail(`${path}.siegeSwarmPortion`, "0 before the Frozen Pit");
  }
  const lifestealClasses = readArray(
    record.lifestealClasses,
    `${path}.lifestealClasses`,
  ).map((entry, index) =>
    readClassId(entry, `${path}.lifestealClasses.${index}`),
  );
  const waves = readArray(record.waves, `${path}.waves`).map((entry, index) =>
    readWave(entry, `${path}.waves.${index}`, id),
  );
  for (const type of WAVE_TYPES) {
    if (!waves.some((wave) => wave.type === type)) {
      return fail(`${path}.waves`, `a ${type} wave`);
    }
  }
  const last = waves[waves.length - 1];
  if (last?.type !== "boss") {
    return fail(`${path}.waves`, "boss-gated at the end");
  }
  for (let index = 1; index < waves.length; index += 1) {
    const previous = waves[index - 1];
    const current = waves[index];
    if (!previous || !current) continue;
    if (current.spawnAtSeconds <= previous.spawnAtSeconds) {
      return fail(`${path}.waves`, "strictly increasing spawn times");
    }
  }
  return { id, lifestealClasses, siegeSwarmPortion: portion, waves };
}

/**
 * Parses both catalogs and checks that every affix and boss is present.
 * @param waves - Raw wave document
 * @param bosses - Raw boss document
 * @returns Schedules and bosses
 */
function parseCatalogs(
  waves: unknown,
  bosses: unknown,
): { bosses: readonly BossDefinition[]; schedules: readonly WaveSchedule[] } {
  const waveRoot = readRecord(waves, "waves.json");
  const bossRoot = readRecord(bosses, "bosses.json");
  const schedules = readArray(waveRoot.layers, "waves.json.layers").map(
    (entry, index) => readSchedule(entry, `waves.json.layers.${index}`),
  );
  const parsedBosses = readArray(bossRoot.bosses, "bosses.json.bosses").map(
    (entry, index) => readBoss(entry, `bosses.json.bosses.${index}`),
  );
  if (schedules.length !== LAYER_TABLE.layers.length) {
    fail("waves.json.layers", "one schedule per playable layer");
  }
  const layerIds = new Set<string>();
  const waveIds = new Set<string>();
  const affixes = new Set<EliteAffixId>();
  for (const schedule of schedules) {
    if (layerIds.has(schedule.id)) {
      fail(`waves.json.layers.${schedule.id}`, "unique");
    }
    layerIds.add(schedule.id);
    for (const wave of schedule.waves) {
      if (waveIds.has(wave.id)) fail(`waves.json wave ${wave.id}`, "unique");
      waveIds.add(wave.id);
      if (wave.elite) affixes.add(wave.elite.affix);
    }
  }
  for (const layer of LAYER_TABLE.layers) {
    if (!layerIds.has(layer.id)) {
      fail("waves.json.layers", `a schedule for ${layer.id}`);
    }
  }
  for (const affix of AFFIXES) {
    if (!affixes.has(affix)) fail("waves.json", `an elite with affix ${affix}`);
  }
  if (parsedBosses.length !== Object.keys(BOSS_LAYER).length) {
    fail("bosses.json.bosses", "the five layer bosses");
  }
  const bossIds = new Set<string>();
  for (const boss of parsedBosses) {
    if (bossIds.has(boss.id)) fail(`bosses.json ${boss.id}`, "unique");
    bossIds.add(boss.id);
  }
  for (const bossId of Object.keys(BOSS_LAYER) as NarrativeBossId[]) {
    if (!bossIds.has(bossId)) fail("bosses.json.bosses", bossId);
  }
  return { bosses: parsedBosses, schedules };
}

const PARSED = parseCatalogs(waveData, bossData);

/** Fixed wave schedules for the five playable layers. */
export const WAVE_SCHEDULES: readonly WaveSchedule[] = PARSED.schedules;

/** The five layer bosses. */
export const BOSS_DEFINITIONS: readonly BossDefinition[] = PARSED.bosses;

/**
 * Reports whether a string is a playable layer id.
 * @param value - Candidate id, or null when the sim has no layer yet
 * @returns Whether the catalog has that layer
 */
export function isLayerId(value: string | null): value is LayerId {
  return (
    value !== null && WAVE_SCHEDULES.some((schedule) => schedule.id === value)
  );
}

/**
 * Returns one layer's wave schedule.
 * @param layerId - Layer to read
 * @returns Its schedule
 */
export function getSchedule(layerId: LayerId): WaveSchedule {
  const schedule = WAVE_SCHEDULES.find((entry) => entry.id === layerId);
  if (!schedule) throw new Error(`Unknown wave schedule: ${layerId}`);
  return schedule;
}

/**
 * Returns one wave by id.
 * @param waveId - Wave id from the catalog
 * @returns The wave
 */
export function getWave(waveId: string): WaveDefinition {
  for (const schedule of WAVE_SCHEDULES) {
    const wave = schedule.waves.find((entry) => entry.id === waveId);
    if (wave) return wave;
  }
  throw new Error(`Unknown wave: ${waveId}`);
}

/**
 * Returns one boss by id.
 * @param bossId - Narrative boss id
 * @returns The boss
 */
export function getBossDefinition(bossId: NarrativeBossId): BossDefinition {
  const boss = BOSS_DEFINITIONS.find((entry) => entry.id === bossId);
  if (!boss) throw new Error(`Unknown boss: ${bossId}`);
  return boss;
}
