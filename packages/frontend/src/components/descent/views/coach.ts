import type { OnboardingFlags } from "./presentation";

/** One Ashen Gate coach mark. */
export type CoachMarkId = "controls" | "pill" | "realm" | "school";

/** Short copy for a coach mark. These are not modal briefings. */
export const COACH_MARKS: Record<CoachMarkId, { body: string; title: string }> =
  {
    controls: {
      body: "Drag to select. Right-click a glowing resource to gather, or the ground to move.",
      title: "Controls",
    },
    pill: {
      body: "Permanent boost. Max 3 toxicity per realm.",
      title: "Body Pill",
    },
    realm: {
      body: "Fill merit and essence to reach Sworn.",
      title: "Ranks",
    },
    school: {
      body: "Choose Ember, Rime, or Blood. Locked for this run.",
      title: "School",
    },
  };

/**
 * Picks the single Ashen Gate coach mark that should be on screen.
 * Controls, then realm, then pill, then school. Other layers teach nothing here.
 * @param input - Flags, dismissals, and which gate the player has open
 * @returns The mark to show, or null
 */
export function activeCoach(input: {
  dismissed: readonly CoachMarkId[];
  feedOpen: boolean;
  flags: OnboardingFlags;
  furnaceSelected: boolean;
  holdUnitPresent: boolean;
  layerName: string;
  schoolChoiceVisible: boolean;
}): CoachMarkId | null {
  if (input.layerName !== "Ashen Gate") return null;
  const dismissed = new Set(input.dismissed);
  if (!dismissed.has("controls")) return "controls";
  if (
    input.flags.realmGate &&
    input.holdUnitPresent &&
    !dismissed.has("realm")
  ) {
    return "realm";
  }
  const pillContext = input.feedOpen || input.furnaceSelected;
  if (input.flags.pill && pillContext && !dismissed.has("pill")) return "pill";
  if (
    input.flags.school &&
    input.schoolChoiceVisible &&
    !dismissed.has("school")
  ) {
    return "school";
  }
  return null;
}
