import type { EndingBlurb, EndingId } from "./types";

/** Deliberate presentation order for the authored conclusion copy. */
export const NARRATIVE_ENDING_ORDER = [
  "quota",
  "shutdown",
  "compact",
] as const satisfies readonly EndingId[];

/** Authored conclusion copy; availability is controlled by external feature flags. */
export const ENDING_BLURBS = {
  compact: {
    endingId: "compact",
    name: "Compact",
    stretch: true,
    text: "The old Ledger is opened between enemies. Isolde names the measure, the Warden binds the furnace, and the Hold sends witnesses instead of extractors. It is not peace, only a promise with enough hands upon it that breaking it will never again look like an accounting error.",
  },
  quota: {
    endingId: "quota",
    name: "Quota",
    stretch: false,
    text: "The furnace remains lit, but its old measure is carved where no governor can hide it. The Hold keeps enough warmth to survive; the Layers keep the names and rest of their dead. Below, the horde grows quiet—not forgiven, not forgotten, but no longer fed without limit.",
  },
  shutdown: {
    endingId: "shutdown",
    name: "Shutdown",
    stretch: false,
    text: "The last conduit cools beneath Edda's hand. Lights fail across the Hold, storehouses open, and the living face their first winter without borrowed souls. Below, the Sea stills. For the first time in generations, every death belongs to the dead.",
  },
} as const satisfies Record<EndingId, EndingBlurb>;
