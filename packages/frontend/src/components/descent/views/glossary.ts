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
    meaning:
      "Shared stockpile for pills and breakthroughs; separate from each soldier's Personal Essence",
    term: "Essence",
  },
  {
    meaning:
      "Sword, Flying-Sword, and Formation classes with Qi Arts (C) and Meditation (M); every soldier cultivates",
    term: "Qi Cultivator",
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
      "Meditate in place (press M) to absorb Personal Essence & Merit — 2.5× near Veins, Arrays, or Seclusion Pavilions",
    term: "Seclusion",
  },
  {
    meaning:
      "Produces shared Essence; nearby Qi cultivators gain 2× Qi regen, faster cooldowns, stronger arts, and 2.5× Meditation gains",
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
