import type { EconomyUnit } from "../economy/model";
import { asBuilding, economyHost, isEconomyUnit } from "../economy/records";
import { TICKS_PER_SECOND } from "../sim/constants";
import type { TickContext } from "../sim/modules";
import type { SimWorldState } from "../sim/world";
import type { ClassId, RankTitle, SchoolId } from "../types";
import { damageWaveUnit } from "../waves/clock";
import {
  cultivationRecord,
  layerSchoolModifier,
  openCultivation,
  saveCultivation,
} from "./sliceCultivation";
import {
  type CultivatorPowerState,
  ECONOMY_STEP_TICKS,
  pushFx,
  pushNotice,
  sliceState,
  waveState,
} from "./sliceState";

/** Unit classes that channel Qi, meditate, and unleash active Dao Arts. */
export type CultivatorClassId =
  | "cultivator"
  | "sword_sage"
  | "formation_master";

/** Aura radius of a completed Spirit Gathering Array. */
export const SPIRIT_ARRAY_RADIUS = 6;

/** Aura radius of a completed Seclusion Pavilion. */
export const MEDITATION_PAVILION_RADIUS = 5;

/** Proximity radius around a Spirit Vein for amplified meditation. */
const SPIRIT_VEIN_MEDITATE_RADIUS = 3.5;

/** Maximum Qi pool granted at each cultivation rank. */
const MAX_QI_BY_RANK: Readonly<Record<RankTitle, number>> = {
  Ascended: 250,
  Ashborn: 100,
  Champion: 200,
  Sworn: 130,
  Veteran: 160,
};

/** Damage multiplier for Qi Arts at each cultivation rank. */
const ART_SCALE_BY_RANK: Readonly<Record<RankTitle, number>> = {
  Ascended: 3.2,
  Ashborn: 1,
  Champion: 2.3,
  Sworn: 1.4,
  Veteran: 1.85,
};

/** Passive Qi restored per sim-second before array or meditation bonuses. */
const BASE_QI_PER_SECOND = 4;

/** Extra Qi restored per sim-second while meditating. */
const MEDITATE_QI_PER_SECOND = 10;

/** HP restored per sim-second while meditating. */
const MEDITATE_HP_PER_SECOND = 4;

/** Personal Essence gained per sim-second while meditating on open ground. */
const MEDITATE_ESSENCE_PER_SECOND = 2;

/** Personal Merit gained per sim-second while meditating on open ground. */
const MEDITATE_MERIT_PER_SECOND = 3;

/** Multiplier when meditating near a Spirit Vein, Spirit Array, or Pavilion. */
const SACRED_GROUND_MULTIPLIER = 2.5;

/** Passive Essence per second granted to cultivators near a Seclusion Pavilion. */
const PAVILION_ESSENCE_PER_SECOND = 1.5;

/** Passive Merit per second granted to cultivators near a Seclusion Pavilion. */
const PAVILION_MERIT_PER_SECOND = 2.5;

/** Duration of the Spirit Surge combat buff, in seconds. */
export const SPIRIT_SURGE_SECONDS = 8;

/** Damage multiplier while Spirit Surge is active. */
export const SPIRIT_SURGE_DAMAGE_BONUS = 0.25;

/** Movement speed multiplier while Spirit Surge is active. */
export const SPIRIT_SURGE_SPEED_BONUS = 0.15;

/** Static specification of one cultivator Qi Art. */
export interface QiArtSpec {
  baseDamage: number;
  baseHeal: number;
  cooldownSeconds: number;
  description: string;
  grantsSurge: boolean;
  lifestealRatio: number;
  maxTargets: number;
  name: string;
  qiCost: number;
  radius: number;
  school?: SchoolId;
}

/**
 * Checks whether a unit class uses Qi, meditation, and active Dao Arts.
 * @param classId - Unit class id
 * @returns True for Sword, Flying-Sword, and Formation Cultivators
 */
export function isCultivatorClass(
  classId: ClassId,
): classId is CultivatorClassId {
  return (
    classId === "cultivator" ||
    classId === "sword_sage" ||
    classId === "formation_master"
  );
}

/**
 * Resolves the signature Qi Art for a cultivator's class, school, and rank.
 * @param classId - Cultivator class
 * @param school - Locked Dao school, if Sworn or above
 * @param rank - Current cultivation rank
 * @returns Tuned Qi Art specification
 */
export function describeQiArt(
  classId: CultivatorClassId,
  school: SchoolId | undefined,
  rank: RankTitle,
): QiArtSpec {
  const rankScale = ART_SCALE_BY_RANK[rank];
  if (classId === "sword_sage") {
    return swordSageArt(school, rankScale);
  }
  if (classId === "formation_master") {
    return formationMasterArt(school, rankScale);
  }
  return swordCultivatorArt(school, rankScale);
}

/**
 * Sword Cultivator melee-nova arts by Dao school.
 * @param school - Chosen school, if any
 * @param scale - Rank power multiplier
 * @returns Qi Art specification
 */
function swordCultivatorArt(
  school: SchoolId | undefined,
  scale: number,
): QiArtSpec {
  if (school === "ember") {
    return {
      baseDamage: Math.round(48 * scale),
      baseHeal: 0,
      cooldownSeconds: 12,
      description:
        "Erupts in a ring of spirit-fire, scorching nearby foes with Ember Qi.",
      grantsSurge: false,
      lifestealRatio: 0,
      maxTargets: 6,
      name: "Blazing Lotus",
      qiCost: 55,
      radius: 4.5,
      school: "ember",
    };
  }
  if (school === "rime") {
    return {
      baseDamage: Math.round(36 * scale),
      baseHeal: Math.round(28 * scale),
      cooldownSeconds: 12,
      description:
        "Shatters frost around the cultivator, chilling foes and mending nearby allies.",
      grantsSurge: false,
      lifestealRatio: 0,
      maxTargets: 6,
      name: "Glacial Mirror",
      qiCost: 55,
      radius: 4.5,
      school: "rime",
    };
  }
  if (school === "blood") {
    return {
      baseDamage: Math.round(42 * scale),
      baseHeal: 0,
      cooldownSeconds: 12,
      description:
        "Whirls in a crimson arc, draining half of the damage dealt back as life.",
      grantsSurge: false,
      lifestealRatio: 0.5,
      maxTargets: 6,
      name: "Crimson Tempest",
      qiCost: 55,
      radius: 4.2,
      school: "blood",
    };
  }
  return {
    baseDamage: Math.round(32 * scale),
    baseHeal: 0,
    cooldownSeconds: 10,
    description:
      "Unleashes a crescent burst of pure Qi against all nearby enemies.",
    grantsSurge: false,
    lifestealRatio: 0,
    maxTargets: 5,
    name: "Sword Qi Wave",
    qiCost: 45,
    radius: 3.8,
  };
}

/**
 * Flying-Sword Cultivator wide-area blade volleys by Dao school.
 * @param school - Chosen school, if any
 * @param scale - Rank power multiplier
 * @returns Qi Art specification
 */
function swordSageArt(school: SchoolId | undefined, scale: number): QiArtSpec {
  if (school === "ember") {
    return {
      baseDamage: Math.round(44 * scale),
      baseHeal: 0,
      cooldownSeconds: 13,
      description:
        "Rains blazing spirit swords across a wide radius, searing the horde.",
      grantsSurge: false,
      lifestealRatio: 0,
      maxTargets: 7,
      name: "Solar Sword Rain",
      qiCost: 60,
      radius: 7,
      school: "ember",
    };
  }
  if (school === "rime") {
    return {
      baseDamage: Math.round(38 * scale),
      baseHeal: 0,
      cooldownSeconds: 13,
      description:
        "Hurls a storm of ice blades across the lane, slowing every target struck.",
      grantsSurge: false,
      lifestealRatio: 0,
      maxTargets: 7,
      name: "Frostblade Barrage",
      qiCost: 60,
      radius: 7,
      school: "rime",
    };
  }
  if (school === "blood") {
    return {
      baseDamage: Math.round(52 * scale),
      baseHeal: 0,
      cooldownSeconds: 13,
      description:
        "Drives crimson blades through up to five foes, siphoning vitality on impact.",
      grantsSurge: false,
      lifestealRatio: 0.35,
      maxTargets: 5,
      name: "Sanguine Execution",
      qiCost: 60,
      radius: 7,
      school: "blood",
    };
  }
  return {
    baseDamage: Math.round(30 * scale),
    baseHeal: 0,
    cooldownSeconds: 11,
    description:
      "Commands a volley of levitating spirit blades against foes within range.",
    grantsSurge: false,
    lifestealRatio: 0,
    maxTargets: 6,
    name: "Thousand-Blade Volley",
    qiCost: 50,
    radius: 6.5,
  };
}

/**
 * Formation Master battlefield arrays by Dao school.
 * @param school - Chosen school, if any
 * @param scale - Rank power multiplier
 * @returns Qi Art specification
 */
function formationMasterArt(
  school: SchoolId | undefined,
  scale: number,
): QiArtSpec {
  if (school === "ember") {
    return {
      baseDamage: Math.round(34 * scale),
      baseHeal: Math.round(20 * scale),
      cooldownSeconds: 14,
      description:
        "Ignites a Furnace Array, surging nearby allies' attack and scorching foes.",
      grantsSurge: true,
      lifestealRatio: 0,
      maxTargets: 6,
      name: "Furnace Array",
      qiCost: 60,
      radius: 6.5,
      school: "ember",
    };
  }
  if (school === "rime") {
    return {
      baseDamage: Math.round(24 * scale),
      baseHeal: Math.round(45 * scale),
      cooldownSeconds: 14,
      description:
        "Raises a Glacial Sanctum that heavily restores nearby allies and chills foes.",
      grantsSurge: true,
      lifestealRatio: 0,
      maxTargets: 6,
      name: "Glacial Sanctum",
      qiCost: 60,
      radius: 6.5,
      school: "rime",
    };
  }
  if (school === "blood") {
    return {
      baseDamage: Math.round(36 * scale),
      baseHeal: Math.round(25 * scale),
      cooldownSeconds: 14,
      description:
        "Unfurls a Blood-Oath Banner, surging allies and siphoning life from nearby foes.",
      grantsSurge: true,
      lifestealRatio: 0.4,
      maxTargets: 6,
      name: "Blood-Oath Banner",
      qiCost: 60,
      radius: 6.5,
      school: "blood",
    };
  }
  return {
    baseDamage: Math.round(20 * scale),
    baseHeal: Math.round(30 * scale),
    cooldownSeconds: 13,
    description:
      "Projects a Spirit Ward Array that heals nearby allies, grants Spirit Surge, and pulses foes.",
    grantsSurge: true,
    lifestealRatio: 0,
    maxTargets: 5,
    name: "Spirit Ward Array",
    qiCost: 55,
    radius: 6,
  };
}

/**
 * Ensures the slice state holds a cultivator power bag.
 * @param world - Sim world
 * @returns Mutable map keyed by unit id
 */
function powerMap(world: SimWorldState): Record<string, CultivatorPowerState> {
  const state = sliceState(world);
  state.cultivatorPowers ??= {};
  return state.cultivatorPowers;
}

/**
 * Reads or initializes one cultivator's Qi and meditation record.
 * @param world - Sim world
 * @param unitId - Cultivator unit id
 * @returns Mutable power record
 */
export function ensureCultivatorPower(
  world: SimWorldState,
  unitId: string,
): CultivatorPowerState {
  const bag = powerMap(world);
  const rank = cultivationRecord(world, unitId)?.rank ?? "Ashborn";
  const maxQi = MAX_QI_BY_RANK[rank];
  const existing = bag[unitId];
  if (existing !== undefined) {
    existing.maxQi = maxQi;
    existing.qi = Math.min(existing.qi, maxQi);
    return existing;
  }
  const created: CultivatorPowerState = {
    cooldownSeconds: 0,
    maxQi,
    meditateEssenceAcc: 0,
    meditateMeritAcc: 0,
    meditating: false,
    qi: maxQi,
    surgeSeconds: 0,
  };
  bag[unitId] = created;
  return created;
}

/**
 * Reads a cultivator's saved power record without mutating state.
 * @param world - Sim world
 * @param unitId - Unit id
 * @returns Power record, or undefined for non-cultivators
 */
export function readCultivatorPower(
  world: SimWorldState,
  unitId: string,
): CultivatorPowerState | undefined {
  return sliceState(world).cultivatorPowers?.[unitId];
}

/**
 * Checks whether a point lies inside any completed Spirit Gathering Array.
 * @param world - Sim world
 * @param x - Map x
 * @param y - Map y
 * @returns True when empowered by an array
 */
export function isInsideSpiritArray(
  world: SimWorldState,
  x: number,
  y: number,
): boolean {
  return hasCompletedBuildingNear(
    world,
    "spirit_array",
    x,
    y,
    SPIRIT_ARRAY_RADIUS,
  );
}

/**
 * Identifies the nearby source of the 2.5× Meditation bonus.
 * @param world - Sim world
 * @param x - Map x
 * @param y - Map y
 * @returns The nearby sacred-ground source, or null on ordinary ground
 */
export function sacredGroundAt(
  world: SimWorldState,
  x: number,
  y: number,
): "array" | "pavilion" | "vein" | null {
  if (isInsideSpiritArray(world, x, y)) return "array";
  if (
    hasCompletedBuildingNear(
      world,
      "meditation_pavilion",
      x,
      y,
      MEDITATION_PAVILION_RADIUS,
    )
  ) {
    return "pavilion";
  }
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const onVein = host.economy.veins.some(
    (vein) => Math.hypot(vein.x - x, vein.y - y) <= SPIRIT_VEIN_MEDITATE_RADIUS,
  );
  return onVein ? "vein" : null;
}

/**
 * Checks whether a point lies near a Spirit Vein, Spirit Array, or Pavilion.
 * @param world - Sim world
 * @param x - Map x
 * @param y - Map y
 * @returns True when meditation speed is amplified
 */
export function isOnSacredGround(
  world: SimWorldState,
  x: number,
  y: number,
): boolean {
  return sacredGroundAt(world, x, y) !== null;
}

/**
 * Checks whether a completed building of `buildingType` sits within `radius`.
 * @param world - Sim world
 * @param buildingType - Building type id
 * @param x - Query x
 * @param y - Query y
 * @param radius - Maximum distance
 * @returns True if at least one matching building is in range
 */
function hasCompletedBuildingNear(
  world: SimWorldState,
  buildingType: string,
  x: number,
  y: number,
  radius: number,
): boolean {
  for (const building of world.buildings) {
    const record = asBuilding(building);
    if (!record.completed || record.buildingType !== buildingType) continue;
    if (Math.hypot(record.x - x, record.y - y) <= radius) return true;
  }
  return false;
}

/**
 * Ends meditation for any of the listed units (called when move/attack orders arrive).
 * @param world - Sim world
 * @param unitIds - Units receiving a new order
 */
export function cancelMeditation(
  world: SimWorldState,
  unitIds: readonly string[],
): void {
  const bag = sliceState(world).cultivatorPowers;
  if (bag === undefined) return;
  for (const unitId of unitIds) {
    const entry = bag[unitId];
    if (entry !== undefined) entry.meditating = false;
  }
}

/**
 * Toggles seclusion meditation for selected cultivator units.
 * @param world - Sim world
 * @param unitIds - Authorized unit ids
 */
export function toggleMeditate(
  world: SimWorldState,
  unitIds: readonly string[],
): void {
  const cultivators = livingCultivators(world, unitIds);
  if (cultivators.length === 0) return;
  const anyMeditating = cultivators.some(
    (unit) => ensureCultivatorPower(world, unit.id).meditating,
  );
  const next = !anyMeditating;
  let onSacred = false;
  for (const unit of cultivators) {
    const power = ensureCultivatorPower(world, unit.id);
    power.meditating = next;
    if (next && isOnSacredGround(world, unit.x, unit.y)) {
      onSacred = true;
    }
  }
  if (!next) {
    pushNotice(world, "Meditation ended. Cultivators stand ready.", "info");
    return;
  }
  pushNotice(
    world,
    onSacred
      ? "Seclusion begun on sacred Qi ground (2.5× Essence & Merit)."
      : "Meditation begun. Stand near a Spirit Vein or Array for 2.5× speed.",
    "good",
  );
}

/**
 * Advances Qi regeneration, cooldowns, Spirit Surge timers, Seclusion Pavilion
 * passive cultivation, and active meditation for every living cultivator.
 * @param world - Sim world
 */
export function advanceCultivatorPowersTick(world: SimWorldState): void {
  const dt = 1 / TICKS_PER_SECOND;
  const state = sliceState(world);
  const bag = powerMap(world);
  const livingIds = new Set<string>();
  let cultivation: ReturnType<typeof openCultivation> | null = null;
  let cultivationDirty = false;

  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0) continue;
    if (!isCultivatorClass(unit.classId)) continue;
    livingIds.add(unit.id);
    const power = ensureCultivatorPower(world, unit.id);
    const inArray = isInsideSpiritArray(world, unit.x, unit.y);
    const inPavilion = hasCompletedBuildingNear(
      world,
      "meditation_pavilion",
      unit.x,
      unit.y,
      MEDITATION_PAVILION_RADIUS,
    );

    if (power.cooldownSeconds > 0) {
      const cdRate = inArray ? 1.25 : 1;
      power.cooldownSeconds = Math.max(0, power.cooldownSeconds - dt * cdRate);
    }
    if (power.surgeSeconds > 0) {
      power.surgeSeconds = Math.max(0, power.surgeSeconds - dt);
    }
    const injuryLeft = state.injuries[unit.id];
    if (inPavilion && injuryLeft !== undefined && injuryLeft > 0) {
      state.injuries[unit.id] = Math.max(0, injuryLeft - dt);
    }

    const qiRate =
      (BASE_QI_PER_SECOND + (power.meditating ? MEDITATE_QI_PER_SECOND : 0)) *
      (inArray ? 2 : 1);
    power.qi = Math.min(power.maxQi, power.qi + qiRate * dt);

    if (power.meditating) {
      unit.hp = Math.min(unit.maxHp, unit.hp + MEDITATE_HP_PER_SECOND * dt);
      const mult = isOnSacredGround(world, unit.x, unit.y)
        ? SACRED_GROUND_MULTIPLIER
        : 1;
      power.meditateEssenceAcc += MEDITATE_ESSENCE_PER_SECOND * mult * dt;
      power.meditateMeritAcc += MEDITATE_MERIT_PER_SECOND * mult * dt;
    }
    if (inPavilion) {
      power.meditateEssenceAcc += PAVILION_ESSENCE_PER_SECOND * dt;
      power.meditateMeritAcc += PAVILION_MERIT_PER_SECOND * dt;
    }

    const wholeEssence = Math.floor(power.meditateEssenceAcc);
    const wholeMerit = Math.floor(power.meditateMeritAcc);
    if (wholeEssence > 0 || wholeMerit > 0) {
      cultivation ??= openCultivation(world);
      if (cultivation.hasUnit(unit.id)) {
        if (wholeEssence > 0) {
          cultivation.awardEssence(unit.id, wholeEssence);
          power.meditateEssenceAcc -= wholeEssence;
          cultivationDirty = true;
        }
        if (wholeMerit > 0) {
          cultivation.awardMerit(unit.id, wholeMerit);
          power.meditateMeritAcc -= wholeMerit;
          cultivationDirty = true;
        }
      }
    }
  }

  for (const id of Object.keys(bag)) {
    if (!livingIds.has(id)) delete bag[id];
  }
  if (cultivation !== null && cultivationDirty) {
    saveCultivation(world, cultivation);
  }
}

/**
 * Unleashes the signature Qi Art for every ready cultivator in `unitIds`.
 * @param context - Current tick context
 * @param unitIds - Authorized unit ids
 */
export function castQiArt(
  context: TickContext,
  unitIds: readonly string[],
): void {
  const world = context.world;
  const cultivators = livingCultivators(world, unitIds);
  if (cultivators.length === 0) return;

  let castCount = 0;
  let lastArtName = "";
  let blockedReason: string | null = null;

  for (const caster of cultivators) {
    const power = ensureCultivatorPower(world, caster.id);
    const record = cultivationRecord(world, caster.id);
    const rank = record?.rank ?? "Ashborn";
    const school = record?.school;
    const spec = describeQiArt(caster.classId, school, rank);

    if (power.cooldownSeconds > 0.05) {
      blockedReason ??= `${spec.name} recharging (${Math.ceil(power.cooldownSeconds)}s).`;
      continue;
    }
    if (power.qi < spec.qiCost) {
      blockedReason ??= `Need ${spec.qiCost} Qi for ${spec.name}.`;
      continue;
    }

    power.qi = Math.max(0, power.qi - spec.qiCost);
    power.cooldownSeconds = spec.cooldownSeconds;
    power.meditating = false;
    applyQiArtEffects(context, caster, spec);
    castCount += 1;
    lastArtName = spec.name;
  }

  if (castCount === 0 && blockedReason !== null) {
    pushNotice(world, blockedReason, "warn");
    return;
  }
  if (castCount > 0) {
    pushNotice(
      world,
      castCount === 1
        ? `${lastArtName} unleashed!`
        : `${castCount} cultivators unleash their Dao Arts!`,
      "good",
    );
  }
}

/**
 * Resolves damage, healing, Spirit Surge, and visual FX for one cast Qi Art.
 * @param context - Tick context
 * @param caster - Cultivator casting the art
 * @param spec - Resolved Qi Art spec
 */
function applyQiArtEffects(
  context: TickContext,
  caster: EconomyUnit,
  spec: QiArtSpec,
): void {
  const world = context.world;
  const inArray = isInsideSpiritArray(world, caster.x, caster.y);
  const schoolMult =
    spec.school === undefined ? 1 : layerSchoolModifier(world, spec.school);
  const potency = (inArray ? 1.15 : 1) * schoolMult;

  pushFx(world, {
    kind: "qi_nova",
    radius: spec.radius,
    school: spec.school,
    x: caster.x,
    y: caster.y,
  });

  if (spec.baseDamage > 0) {
    const dealt = damageNearbyHorde(
      context,
      caster,
      spec,
      Math.round(spec.baseDamage * potency),
    );
    if (spec.lifestealRatio > 0 && dealt > 0) {
      caster.hp = Math.min(
        caster.maxHp,
        caster.hp + dealt * spec.lifestealRatio,
      );
    }
  }

  if (spec.baseHeal > 0 || spec.grantsSurge) {
    buffNearbyAllies(
      world,
      caster,
      spec.radius,
      Math.round(spec.baseHeal * potency),
      spec.grantsSurge,
    );
  }
}

/**
 * Applies Qi Art spirit damage to nearby horde bodies and awards kill credit.
 * @param context - Tick context
 * @param caster - Casting cultivator
 * @param spec - Qi Art specification
 * @param damage - Final spell damage per target
 * @returns Total damage dealt across targets
 */
function damageNearbyHorde(
  context: TickContext,
  caster: EconomyUnit,
  spec: QiArtSpec,
  damage: number,
): number {
  const world = context.world;
  const waves = waveState(world);
  const state = sliceState(world);
  const inRange = waves.units
    .filter(
      (enemy) =>
        enemy.hitPoints > 0 &&
        Math.hypot(enemy.x - caster.x, enemy.y - caster.y) <= spec.radius,
    )
    .sort(
      (left, right) =>
        Math.hypot(left.x - caster.x, left.y - caster.y) -
        Math.hypot(right.x - caster.x, right.y - caster.y),
    )
    .slice(0, spec.maxTargets);

  let totalDealt = 0;
  let cultivation: ReturnType<typeof openCultivation> | null = null;

  for (const enemy of inRange) {
    const beforeHp = enemy.hitPoints;
    const waveEvents = damageWaveUnit(waves, enemy.id, damage, "spell");
    const dealt = Math.max(0, beforeHp - Math.max(0, enemy.hitPoints));
    totalDealt += dealt;
    pushFx(world, {
      amount: Math.max(1, Math.round(dealt || damage)),
      critical: true,
      kind: "damage",
      x: enemy.x,
      y: enemy.y,
    });
    pushFx(world, {
      from: { x: caster.x, y: caster.y },
      kind: "projectile",
      sound: "magic",
      to: { x: enemy.x, y: enemy.y },
    });

    const died =
      enemy.hitPoints <= 0 ||
      waveEvents.some((event) => event.type === "boss_killed");
    if (died) {
      state.stats.kills += 1;
      pushFx(world, {
        kind: "death",
        x: enemy.x,
        y: enemy.y,
      });
      cultivation ??= openCultivation(world);
      if (cultivation.hasUnit(caster.id)) {
        cultivation.awardMerit(caster.id, enemy.role === "boss" ? 150 : 18);
        cultivation.awardEssence(caster.id, enemy.role === "boss" ? 60 : 10);
        cultivation.recordCombatProof(caster.id, 1);
      }
      world.units = world.units.filter((entry) => entry.id !== enemy.id);
    }
  }

  if (cultivation !== null) {
    saveCultivation(world, cultivation);
  }
  return totalDealt;
}

/**
 * Heals and/or grants Spirit Surge to nearby Hold allies.
 * @param world - Sim world
 * @param caster - Casting cultivator
 * @param radius - Effect radius
 * @param healAmount - HP restored per ally
 * @param grantsSurge - Whether to apply Spirit Surge
 */
function buffNearbyAllies(
  world: SimWorldState,
  caster: EconomyUnit,
  radius: number,
  healAmount: number,
  grantsSurge: boolean,
): void {
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0) continue;
    if (Math.hypot(unit.x - caster.x, unit.y - caster.y) > radius) continue;
    if (healAmount > 0 && unit.hp < unit.maxHp) {
      unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);
      pushFx(world, {
        from: { x: caster.x, y: caster.y },
        kind: "heal",
        to: { x: unit.x, y: unit.y },
      });
    }
    if (grantsSurge && isCultivatorClass(unit.classId)) {
      const targetPower = ensureCultivatorPower(world, unit.id);
      targetPower.surgeSeconds = Math.max(
        targetPower.surgeSeconds,
        SPIRIT_SURGE_SECONDS,
      );
    }
  }
}

/**
 * Filters `unitIds` to living Hold cultivators.
 * @param world - Sim world
 * @param unitIds - Candidate ids
 * @returns Living cultivator records
 */
function livingCultivators(
  world: SimWorldState,
  unitIds: readonly string[],
): (EconomyUnit & { classId: CultivatorClassId })[] {
  const result: (EconomyUnit & { classId: CultivatorClassId })[] = [];
  for (const unitId of unitIds) {
    const unit = world.units.find((entry) => entry.id === unitId);
    if (!unit || !isEconomyUnit(unit) || unit.hp <= 0) continue;
    if (!isCultivatorClass(unit.classId)) continue;
    result.push(unit as EconomyUnit & { classId: CultivatorClassId });
  }
  return result;
}
