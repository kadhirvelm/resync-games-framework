import {
  ARMORED_PHYSICAL_MULTIPLIER,
  BERSERKER_SPEED_BONUS_CAP,
  BERSERKER_SPEED_PER_ALLY,
  ESSENCE_PER_POWER_POINT,
  HELL_PRESSURE_STAT_BONUS,
  KILL_ESSENCE,
  MINOR_KILL_ESSENCE_FRACTION,
  SIPHON_PAYOUT_FRACTION,
  WAVE_POWER_CAP,
} from "./constants";
import type { DamageKind, EliteAffixId, WaveRole, WaveUnit } from "./types";

/**
 * Placeholder wave power. Collected essence adds power, and the layer grade
 * slows that growth so an early stockpile does not spike a later layer.
 * The result stays inside `[1, 1.6]` (+60% over the layer base).
 * @param collectedEssence - Essence the Hold has harvested
 * @param essenceGrade - Active layer grade (1, 2, 4, 8, 16)
 * @returns Multiplier applied to spawned hit points and damage
 */
export function wavePowerMultiplier(
  collectedEssence: number,
  essenceGrade: number,
): number {
  const grade = Math.max(1, essenceGrade);
  const bonus =
    Math.max(0, collectedEssence) / (ESSENCE_PER_POWER_POINT * grade);
  return Math.min(WAVE_POWER_CAP, 1 + bonus);
}

/**
 * Stat multiplier Hell Pressure applies to living horde bodies.
 * @param pressure - Meter from 0 to 1
 * @returns Hit point and damage multiplier
 */
export function pressureStatMultiplier(pressure: number): number {
  return 1 + Math.min(1, Math.max(0, pressure)) * HELL_PRESSURE_STAT_BONUS;
}

/**
 * Rewrites a body's damage and hit points from its base stats and pressure.
 * Current health is kept as a fraction of the previous maximum.
 * @param unit - Body to rescale
 * @param pressure - Current Hell Pressure, from 0 to 1
 */
export function applyPressure(unit: WaveUnit, pressure: number): void {
  const scale = pressureStatMultiplier(pressure);
  const fraction =
    unit.maxHitPoints <= 0 ? 1 : unit.hitPoints / unit.maxHitPoints;
  unit.maxHitPoints = unit.baseMaxHitPoints * scale;
  unit.hitPoints = unit.maxHitPoints * fraction;
  unit.damage = unit.baseDamage * scale;
}

/**
 * Applies Armored's physical resist. Spells ignore the affix.
 * @param affix - Elite affix, if any
 * @param amount - Incoming damage before the affix
 * @param kind - Physical blows are resisted; spells are not
 * @returns Damage to subtract from hit points
 */
export function resistedDamage(
  affix: EliteAffixId | null,
  amount: number,
  kind: DamageKind,
): number {
  if (affix === "armored" && kind === "physical") {
    return amount * ARMORED_PHYSICAL_MULTIPLIER;
  }
  return amount;
}

/**
 * Essence a horde kill pays the Hold.
 * @param grade - Active essence grade
 * @param siphoned - Whether a living Siphon is close enough to drain it
 * @returns Essence added to the stockpile
 */
export function killEssenceAmount(grade: number, siphoned: boolean): number {
  const base = KILL_ESSENCE * grade;
  if (!siphoned) return base;
  return base * SIPHON_PAYOUT_FRACTION;
}

/**
 * Essence for a kill after the minor-body discount. Summoner fodder and
 * vent imps pay a quarter of a normal kill, rounded down, never below 1.
 * @param amount - Normal kill essence (after grade and Siphon)
 * @param role - Role of the body that died
 * @returns Essence the Hold receives for this body
 */
export function roleKillEssence(amount: number, role: WaveRole): number {
  if (role !== "fodder" && role !== "vent_imp") return amount;
  return Math.max(1, Math.floor(amount * MINOR_KILL_ESSENCE_FRACTION));
}

/**
 * Per-layer horde stat scale so deeper layers field stronger bodies.
 * The square root of the essence grade: 1, 1.41, 2, 2.83, 4.
 * @param essenceGrade - Active layer grade (1, 2, 4, 8, 16)
 * @returns Multiplier applied to spawned hit points and damage
 */
export function hordeStatScale(essenceGrade: number): number {
  return Math.sqrt(Math.max(1, essenceGrade));
}

/**
 * Straight-line distance. Spawn slots are axis-aligned, so this stays exact.
 * @param left - First point
 * @param right - Second point
 * @returns Euclidean distance
 */
export function waveDistance(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/**
 * Speed after Berserker losses, phase multipliers, and an arena rule.
 * The clock passes 1 for `moveSpeedMultiplier`: the Warden's cold rule
 * slows the Hold, never the horde.
 * @param baseSpeed - Speed before affixes and rules
 * @param speedMultiplier - Boss phase multiplier, otherwise 1
 * @param affix - Elite affix, if any
 * @param fallenAllies - Allies of this wave that have already died
 * @param moveSpeedMultiplier - Extra arena multiplier; the clock passes 1
 * @returns Current speed
 */
export function unitSpeed(
  baseSpeed: number,
  speedMultiplier: number,
  affix: EliteAffixId | null,
  fallenAllies: number,
  moveSpeedMultiplier: number,
): number {
  const bonus =
    affix === "berserker"
      ? Math.min(
          BERSERKER_SPEED_BONUS_CAP,
          fallenAllies * BERSERKER_SPEED_PER_ALLY,
        )
      : 0;
  return baseSpeed * speedMultiplier * (1 + bonus) * moveSpeedMultiplier;
}
