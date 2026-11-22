/** One coined Descent term and the plain-language meaning the UI must teach. */
export interface GlossaryEntry {
  meaning: string;
  term: string;
}

/**
 * Shared-contract glossary. Wording matches `docs/descent/01-shared-contract.md`.
 * The dialog renders this list; it is not a second canon.
 */
export const GLOSSARY = [
  {
    meaning: "Your base",
    term: "Hold",
  },
  {
    meaning: "Fuel for pills and breakthroughs",
    term: "Essence",
  },
  {
    meaning: "Ember, Rime, or Blood affinity",
    term: "School",
  },
  {
    meaning: "Your power tier",
    term: "Realm / Rank",
  },
  {
    meaning: "Build here for a bonus",
    term: "Spirit Vein",
  },
  {
    meaning: "Next wave preview",
    term: "Omen",
  },
  {
    meaning: "Permanent-pill limit per realm",
    term: "Toxicity",
  },
  {
    meaning: "Powerful Altar summon",
    term: "Calamity",
  },
  {
    meaning: "Champion-to-Ascended trial",
    term: "Tribulation",
  },
  {
    meaning: "Rises while the layer remains uncleared",
    term: "Hell Pressure",
  },
  {
    meaning: "Hero revival power",
    term: "Great Soul",
  },
  {
    meaning: "Active cultivator technique powered by Qi (press C)",
    term: "Qi Art",
  },
  {
    meaning:
      "Meditate in place (press M) to absorb Essence & Merit — 2.5× near Veins or Arrays",
    term: "Seclusion",
  },
  {
    meaning:
      "Formation pillar that gathers Essence and doubles nearby Cultivator Qi regen",
    term: "Spirit Gathering Array",
  },
] as const satisfies readonly GlossaryEntry[];

/** Terms the onboarding acceptance check requires the glossary to define. */
export const REQUIRED_GLOSSARY_TERMS = [
  "Essence",
  "School",
  "Omen",
  "Spirit Vein",
  "Toxicity",
  "Calamity",
] as const;
