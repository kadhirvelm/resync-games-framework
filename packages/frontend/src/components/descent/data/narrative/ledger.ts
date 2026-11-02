import type { LedgerFragment, NarrativeLayerId } from "./types";

/** Optional Ledger collectibles, one for each playable layer. */
export const LEDGER_FRAGMENTS = {
  ashen_gate: {
    itemId: "ledger_fragment_ashen_gate",
    layerId: "ashen_gate",
    text: "Gate intake exceeded the sworn quota for a seventh season. Unstable remnants are to be returned below and classified as hostile fauna. Provision requests for the returned population are denied.",
    title: "Ledger I — Returned Yield",
  },
  blood_sea: {
    itemId: "ledger_fragment_blood_sea",
    layerId: "blood_sea",
    text: "Unshaped essence now answers injury with hunger and gathers around the voices removed during refinement. Recommendation: suspend extraction. Governor Voss orders the anomaly reclassified as a renewable deposit.",
    title: "Ledger IV — The Sea Learns Hunger",
  },
  bone_wastes: {
    itemId: "ledger_fragment_bone_wastes",
    layerId: "bone_wastes",
    text: "The Ninth through Twelfth Hold Companies, Marshal Orrec Vane commanding, were lost during shaft defense. Their Great Souls did not reach the First Gate. The account records full essence recovery from the field.",
    title: "Ledger II — Companies Recovered",
  },
  frozen_pit: {
    itemId: "ledger_fragment_frozen_pit",
    layerId: "frozen_pit",
    text: "By the Ember Compact, the upper Hold may draw only the heat required to preserve the living through winter. Every named soul remains under the protection of the Layers. Excess draw voids safe passage.",
    title: "Ledger III — The Compact Measure",
  },
  throne_of_hell: {
    itemId: "ledger_fragment_throne_of_hell",
    layerId: "throne_of_hell",
    text: "I, Governor Ilya, seal this true account against every office, including my own. The furnace sustains the living only while its measure is kept. If my successors erase that limit, let the keeper below judge the Hold by what it chooses after learning the cost.",
    title: "Ledger V — Ilya's Seal",
  },
} as const satisfies Record<NarrativeLayerId, LedgerFragment>;
