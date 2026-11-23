import type { SimWorldState } from "../sim/world";
import { sliceState } from "./sliceState";

/** Curated pool of evocative names reserved for unique Hold cultivators. */
export const CULTIVATOR_NAME_POOL: readonly string[] = [
  "Shen Lian",
  "Mo Cang",
  "Lin Qing",
  "Bai Xuan",
  "Gu Yan",
  "Su Mei",
  "Han Jue",
  "Ye Chen",
  "Qiu Ran",
  "Rong Zhi",
  "Wei Shuo",
  "Du Heng",
  "Tang Yu",
  "Xiao Feng",
  "Chu Ning",
  "Fang Mo",
  "Lu Shan",
  "He Jin",
  "Zhen Yue",
  "Xie Lang",
  "Pei Ming",
  "Song Yi",
  "Jiang He",
  "Wen Jing",
  "Yan Zhao",
  "Luo Chen",
  "Qin Yue",
  "Zhou Ming",
  "Xu Ran",
  "Cai Wen",
  "Duan Yu",
  "Feng Qing",
  "Huo Lin",
  "Ji Xuan",
  "Ke Ning",
  "Liang Bo",
];

/**
 * Computes a deterministic 32-bit FNV-1a hash for seeded name selection.
 * @param input - Seed string combining world seed, count, and unit id
 * @returns Unsigned 32-bit integer hash
 */
function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Formats a positive generation number as a Roman numeral suffix.
 * @param generation - 2-based generation index when the base pool wraps
 * @returns Roman numeral string (e.g. "II", "III")
 */
function romanNumeral(generation: number): string {
  const table: readonly [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = Math.max(1, Math.floor(generation));
  let result = "";
  for (const [value, symbol] of table) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
}

/**
 * Collects every cultivator name already issued in this run or currently held
 * by a living unit (covering saves created before `usedCultivatorNames`).
 * @param world - Sim world
 * @returns Set of already-used names
 */
function usedNamesSet(world: SimWorldState): Set<string> {
  const state = sliceState(world);
  const used = new Set<string>(state.usedCultivatorNames ?? []);
  for (const unit of world.units) {
    if (unit.name !== undefined && unit.name.length > 0) {
      used.add(unit.name);
    }
  }
  return used;
}

/**
 * Deterministically assigns a unique personal name to a newly created
 * cultivator and records it on slice state so replacements never reuse it.
 * @param world - Sim world whose seed and used-name history govern selection
 * @param unitId - Stable unit id for tie-breaking determinism
 * @returns A name unique within this run
 */
export function assignUniqueCultivatorName(
  world: SimWorldState,
  unitId: string,
): string {
  const state = sliceState(world);
  state.usedCultivatorNames ??= [];
  const used = usedNamesSet(world);
  const available = CULTIVATOR_NAME_POOL.filter((name) => !used.has(name));
  const seedKey = `${world.seed}:${used.size}:${unitId}`;
  const hash = fnv1a(seedKey);

  let chosen: string;
  if (available.length > 0) {
    chosen = available[hash % available.length] ?? "Shen Lian";
  } else {
    const base =
      CULTIVATOR_NAME_POOL[hash % CULTIVATOR_NAME_POOL.length] ?? "Shen Lian";
    let generation = 2;
    chosen = `${base} ${romanNumeral(generation)}`;
    while (used.has(chosen)) {
      generation += 1;
      chosen = `${base} ${romanNumeral(generation)}`;
    }
  }

  state.usedCultivatorNames.push(chosen);
  return chosen;
}
