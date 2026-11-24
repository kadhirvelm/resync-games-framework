import { describe, expect, test } from "bun:test";
import type { CultivationView } from "../../logic/cultivation/types";
import {
  type CultivationGuidanceUnit,
  cultivationGuidance,
} from "../cultivationGuidance";

/** Builds a selected cultivator with only the fields the guide reads. */
function unit(
  overrides: Partial<CultivationGuidanceUnit> = {},
): CultivationGuidanceUnit {
  const cultivation: CultivationView = {
    combatProof: 0,
    combatProofToNext: 3,
    essence: 0,
    essenceToNext: 50,
    merit: 0,
    meritToNext: 100,
    missingRequirements: [
      "Battle merit 0/100",
      "Combat proof 0/3",
      "Essence 0/50",
    ],
    nextRank: "Sworn",
    passives: [],
    pillNames: [],
    rank: "Ashborn",
    successChance: 0.9,
    toxicity: 0,
    toxicityCap: 3,
  };
  return {
    breakthroughProgress: null,
    breakthroughReady: false,
    cultivation,
    meditating: false,
    qiArt: {
      cooldownSeconds: 0,
      description: "Test art",
      name: "Sword Qi Wave",
      qiCost: 45,
      ready: true,
    },
    ...overrides,
  };
}

describe("cultivationGuidance", () => {
  test("walks through merit, proof, essence, then the ready action", () => {
    const fresh = unit();
    expect(cultivationGuidance(fresh)?.nextStep).toBe(
      "Fight or Meditate to earn 100 more Merit.",
    );
    expect(cultivationGuidance(fresh)?.pillSummary).toBe(
      "No pills fed yet. Brew them at an Alchemy Furnace.",
    );
    const base = fresh.cultivation;
    if (base === null) throw new Error("Missing cultivation");
    const proof = unit({
      cultivation: { ...base, merit: 100, meritToNext: 100 },
    });
    expect(cultivationGuidance(proof)?.nextStep).toBe(
      "Defeat 3 more enemies with this unit fighting nearby.",
    );
    const essence = unit({
      cultivation: {
        ...base,
        combatProof: 3,
        merit: 100,
        meritToNext: 100,
      },
    });
    expect(cultivationGuidance(essence)?.nextStep).toBe(
      "Fight or Meditate to earn 50 more personal Essence.",
    );
    const ready = unit({ breakthroughReady: true });
    expect(cultivationGuidance(ready)?.nextStep).toContain(
      "Breakthrough to Sworn is ready",
    );
  });

  test("shows the live scenario cap without offering another rank", () => {
    const current = unit();
    const base = current.cultivation;
    if (base === null) throw new Error("Missing cultivation");
    const capped = unit({
      cultivation: {
        ...base,
        meritToNext: 0,
        nextRank: undefined,
        rank: "Sworn",
        rankCap: "Sworn",
        rankCapLabel: "Ashen Gate",
        rankCapReached: true,
        school: "ember",
      },
    });
    const guidance = cultivationGuidance(capped);
    expect(guidance?.nextStep).toContain("Ashen Gate rank cap");
    expect(guidance?.nextStep).not.toContain("Veteran");
    expect(guidance?.classNote).toContain("Qi cultivator");
  });

  test("explains schools and already-applied pills", () => {
    const current = unit();
    const base = current.cultivation;
    if (base === null) throw new Error("Missing cultivation");
    const sworn = unit({
      cultivation: {
        ...base,
        nextRank: "Veteran",
        pillNames: ["Body Pill"],
        rank: "Sworn",
        school: undefined,
      },
    });
    const guidance = cultivationGuidance(sworn);
    expect(guidance?.nextStep).toContain("Ember burns");
    expect(guidance?.pillSummary).toContain("Body Pill");
    expect(guidance?.steps[2]).toContain("Rime (freeze)");
  });
});
