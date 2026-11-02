import { describe, expect, test } from "bun:test";

import {
  BONE_LEGION_BARKS,
  BOSS_INTROS,
  BUILDING_TOOLTIPS,
  DESCENT_LORE_REFERENCES,
  ENDING_BLURBS,
  IMP_SWARM_BARKS,
  LAYER_BRIEFINGS,
  LEDGER_FRAGMENTS,
  NARRATIVE_ENDING_ORDER,
  NARRATIVE_FLAG_KEYS,
  NARRATIVE_LAYER_ORDER,
  TREASURE_TOOLTIPS,
  VILLAGER_BARKS,
} from "..";

const LAYER_IDS = [
  "ashen_gate",
  "bone_wastes",
  "frozen_pit",
  "blood_sea",
  "throne_of_hell",
] as const;

describe("Descent narrative data", () => {
  test("covers every playable layer with a briefing, hazard, boss, and Ledger fragment", () => {
    expect(NARRATIVE_LAYER_ORDER).toEqual(LAYER_IDS);
    expect(Object.keys(LAYER_BRIEFINGS).sort()).toEqual([...LAYER_IDS].sort());
    expect(Object.keys(LEDGER_FRAGMENTS).sort()).toEqual([...LAYER_IDS].sort());

    for (const layerId of LAYER_IDS) {
      expect(LAYER_BRIEFINGS[layerId].briefing.length).toBeGreaterThan(40);
      expect(LAYER_BRIEFINGS[layerId].hazard.length).toBeGreaterThan(20);
      expect(LEDGER_FRAGMENTS[layerId].text.length).toBeGreaterThan(40);
      expect(
        Object.values(BOSS_INTROS).some((intro) => intro.layerId === layerId),
      ).toBe(true);
    }
  });

  test("gives each MVP treasure a visible previous owner", () => {
    expect(Object.keys(TREASURE_TOOLTIPS)).toHaveLength(5);

    for (const tooltip of Object.values(TREASURE_TOOLTIPS)) {
      expect(tooltip.previousOwnerLine.startsWith("Previous owner:")).toBe(
        true,
      );
    }
  });

  test("keeps the expected bark pools populated and addressable", () => {
    for (const pool of [VILLAGER_BARKS, IMP_SWARM_BARKS, BONE_LEGION_BARKS]) {
      expect(pool.length).toBeGreaterThanOrEqual(8);
      expect(new Set(pool.map((bark) => bark.id)).size).toBe(pool.length);
    }
  });

  test("publishes all endings without deciding which release flags are enabled", () => {
    expect(NARRATIVE_ENDING_ORDER).toEqual(["quota", "shutdown", "compact"]);
    expect(Object.keys(ENDING_BLURBS).sort()).toEqual([
      "compact",
      "quota",
      "shutdown",
    ]);
    expect(ENDING_BLURBS.compact.stretch).toBe(true);
    expect(Object.keys(NARRATIVE_FLAG_KEYS.endingShips).sort()).toEqual([
      "compact",
      "quota",
      "shutdown",
    ]);
    expect(NARRATIVE_FLAG_KEYS.ilyaUnlock.timing).toBe(
      "descent.ilya_unlock.timing",
    );
  });

  test("uses the Descent ProductNow lore space and read-only references", () => {
    expect(DESCENT_LORE_REFERENCES.gameId).toBe("descent");
    expect(DESCENT_LORE_REFERENCES.documents.gdd.access).toBe("read-only");
    expect(DESCENT_LORE_REFERENCES.documents.loreBible.access).toBe(
      "read-only",
    );
  });

  test("covers the locked core building names", () => {
    const names = new Set<string>(
      Object.values(BUILDING_TOOLTIPS).map((tooltip) => tooltip.name),
    );

    for (const name of [
      "Barracks",
      "Ward Tower",
      "Mess Hall",
      "Hell Market",
      "Alchemy Furnace",
      "Artifact Forge",
      "Cultivation Hall",
      "Hero Hall",
      "Calamity Altar",
      "Deep Mine",
      "Root Cellar",
      "Forward Shrine",
      "Omen Tower",
      "Housing",
      "Storehouse",
    ]) {
      expect(names.has(name)).toBe(true);
    }
  });
});
