import type { OnboardingFlags } from "./presentation";

/** One Ashen Gate coach mark. */
export type CoachMarkId = "pill" | "realm" | "school";

/** Short copy for a coach mark. These are not modal briefings. */
export const COACH_MARKS: Record<CoachMarkId, { body: string; title: string }> =
  {
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
 * Realm, then pill, then school. Other layers teach nothing here.
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
