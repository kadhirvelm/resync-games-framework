import { describe, expect, test } from "bun:test";
import {
  AUTOSAVE_SLOT,
  readSaveSlot,
  saveSlotKey,
  writeSaveSlot,
} from "../../logic/sim";
import {
  createSoloMissionSim,
  missionSaveSlot,
  missionSaveStorage,
} from "../missionSave";

/** Creates an isolated browser-like storage surface for save tests. */
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("solo mission saves", () => {
  test("restores the selected mission without touching the standard solo save", () => {
    const store = storage();
    store.setItem(saveSlotKey(AUTOSAVE_SLOT), "standard-save");
    const first = createSoloMissionSim("ashen_campaign_2", 12);
    first.step();
    expect(
      writeSaveSlot(
        missionSaveStorage(store, "ashen_campaign_2"),
        missionSaveSlot("ashen_campaign_2"),
        first,
      ),
    ).toBe(true);
    const restored = createSoloMissionSim("ashen_campaign_2", 99, store);
    expect(restored.tick).toBe(first.tick);
    expect(restored.snapshot().meta.waves).toEqual(first.snapshot().meta.waves);
    expect(readSaveSlot(store, AUTOSAVE_SLOT)).toBe("standard-save");
  });

  test("rejects a different mission's save even when placed in this mission slot", () => {
    const store = storage();
    const first = createSoloMissionSim("ashen_campaign_1", 12);
    first.step();
    writeSaveSlot(
      missionSaveStorage(store, "ashen_campaign_1"),
      missionSaveSlot("ashen_campaign_1"),
      first,
    );
    const raw = store.getItem(saveSlotKey(missionSaveSlot("ashen_campaign_1")));
    if (raw === null) throw new Error("missing save");
    store.setItem(saveSlotKey(missionSaveSlot("ashen_campaign_2")), raw);
    const restored = createSoloMissionSim("ashen_campaign_2", 99, store);
    expect(restored.tick).toBe(0);
    expect(restored.snapshot().meta.waves).not.toEqual(
      first.snapshot().meta.waves,
    );
    // Even a forged identity must not bypass the selected mission's wave tuning.
    const envelope = JSON.parse(raw) as {
      missionId: string;
      save: string;
      version: number;
    };
    envelope.missionId = "ashen_campaign_2";
    store.setItem(
      saveSlotKey(missionSaveSlot("ashen_campaign_2")),
      JSON.stringify(envelope),
    );
    expect(createSoloMissionSim("ashen_campaign_2", 99, store).tick).toBe(0);
  });
});
