import type { ShellUnit } from "./shellModel";

/** Plain-language cultivation progress for the selected-unit panel. */
export interface CultivationGuidance {
  /** Distinguishes universal soldier cultivation from Qi-class abilities. */
  classNote: string;
  /** One concrete action that advances the unit right now. */
  nextStep: string;
  /** The complete three-step loop, available without a glossary detour. */
  steps: readonly string[];
  /** Pills already applied, or where the next pill comes from. */
  pillSummary: string;
}

/** Fields needed to explain one unit's cultivation progress. */
export type CultivationGuidanceUnit = Pick<
  ShellUnit,
  | "breakthroughProgress"
  | "breakthroughReady"
  | "cultivation"
  | "meditating"
  | "qiArt"
>;

/**
 * Converts cultivation gates and meters into a short action guide. The live
 * cultivation view supplies combat proof and applied pills; older previews
 * simply omit those details.
 * @param unit - Selected cultivating unit
 * @returns Guidance, or null for villagers and enemies
 */
export function cultivationGuidance(
  unit: CultivationGuidanceUnit,
): CultivationGuidance | null {
  const cultivation = unit.cultivation;
  if (cultivation === null) return null;
  const meditation = unit.qiArt === null ? "" : " or Meditate";
  const nextRank = cultivation.nextRank ?? "the next rank";
  const pillNames = cultivation.pillNames ?? [];
  const pillSummary =
    pillNames.length > 0
      ? `Pills active: ${pillNames.join(", ")}.`
      : "No pills fed yet. Brew them at an Alchemy Furnace.";
  const classNote =
    unit.qiArt === null
      ? "Soldier cultivation: combat advances this unit; it has no Qi Arts or Meditation."
      : "Qi cultivator: C casts your art and M meditates. Every soldier cultivates, but only Qi classes use these abilities.";
  if (cultivation.rankCapReached === true) {
    let nextStep = `${cultivation.rank} is the ${cultivation.rankCapLabel ?? "current scenario"} rank cap. Pills and school bonuses can still improve this unit.`;
    if (cultivation.rank === "Sworn" && cultivation.school === undefined) {
      nextStep =
        "Choose a school to finish this promotion: Ember burns, Rime freezes, and Blood heals through damage.";
    }
    return {
      classNote,
      nextStep,
      pillSummary,
      steps: [
        "This unit has reached the live scenario's highest rank; no further breakthrough is available here.",
        "Use its school and pill bonuses to choose fights that suit its strengths.",
        "Other soldiers can still cultivate toward the same cap.",
      ],
    };
  }
  return {
    classNote,
    nextStep: nextCultivationStep(unit, meditation),
    pillSummary,
    steps: [
      `Fight${meditation} to earn Merit, combat proof, and personal Essence.${unit.qiArt === null ? " Kills shared with nearby allies count." : " Meditation also restores Qi and health."}`,
      `Complete the checklist, then Breakthrough to ${nextRank}. Higher ranks multiply health and damage.`,
      "Feed pills for permanent stat boosts. At Sworn, choose Ember (burn), Rime (freeze), or Blood (lifesteal).",
    ],
  };
}

/**
 * Chooses the most useful next action in checklist order.
 * @param unit - Unit being guided
 * @param meditation - " or Meditate" for Qi-using classes, otherwise empty
 * @returns A concise imperative action
 */
function nextCultivationStep(
  unit: CultivationGuidanceUnit,
  meditation: string,
): string {
  const cultivation = unit.cultivation;
  if (cultivation === null) return "";
  if (unit.breakthroughProgress !== null) {
    return "Keep this unit alive until its breakthrough channel finishes.";
  }
  if (unit.breakthroughReady) {
    return `Breakthrough to ${cultivation.nextRank ?? "the next rank"} is ready — use the Breakthrough command.`;
  }
  if (unit.meditating) {
    return "Meditation is earning Merit, Essence, Qi, and health. Move or attack when ready.";
  }
  if (cultivation.rank === "Sworn" && cultivation.school === undefined) {
    return "Choose a school: Ember burns, Rime freezes, and Blood heals through damage.";
  }
  const meritLeft = Math.max(0, cultivation.meritToNext - cultivation.merit);
  if (meritLeft > 0) {
    return `Fight${meditation} to earn ${meritLeft} more Merit.`;
  }
  const proof = cultivation.combatProof;
  const proofTarget = cultivation.combatProofToNext;
  if (proof !== undefined && proofTarget !== undefined && proof < proofTarget) {
    return `Defeat ${proofTarget - proof} more enemies with this unit fighting nearby.`;
  }
  const essenceLeft = Math.max(
    0,
    cultivation.essenceToNext - cultivation.essence,
  );
  if (essenceLeft > 0) {
    return `Fight${meditation} to earn ${essenceLeft} more personal Essence.`;
  }
  const missing = cultivation.missingRequirements;
  if (missing.length === 0) {
    if (cultivation.meritToNext === 0) {
      return "Highest rank reached. Pills and school bonuses can still improve this unit.";
    }
    return `Use Breakthrough when you are ready to become ${cultivation.nextRank ?? "stronger"}.`;
  }
  const first = missing[0] ?? "Complete the breakthrough checklist.";
  if (first.includes("Cultivation Hall")) {
    return "Upgrade to Outpost and build a Cultivation Hall.";
  }
  if (first.includes("materials")) {
    return "Gather the tier materials listed in the Breakthrough checklist.";
  }
  if (first.includes("Breakthrough Pill")) {
    return "Brew a Breakthrough Pill at an Alchemy Furnace.";
  }
  if (first.includes("population")) {
    return "Build Housing to free population for the next rank.";
  }
  if (first.includes("injury")) {
    return "Wait for this unit's breakthrough injury to recover.";
  }
  return first;
}
