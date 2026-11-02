import { describe, expect, test } from "bun:test";
import {
  AUTOSAVE_SLOT,
  attachLayerAutosave,
  readSaveSlot,
  saveSlotKey,
  writeSaveSlot,
} from "../autosave";
import { SIM_SAVE_VERSION } from "../constants";
import { createDescentSim } from "../descentSim";
import { DescentSaveError, parseSerializedWorld } from "../saveFormat";
import {
  captureError,
  createMemoryStorage,
  runScript,
  SANDBOX_SCRIPT,
  sandboxModule,
} from "./fixtures";

describe("serialize / load", () => {
  test("round-trips tick, seed, RNG cursor, and empty collections", () => {
    const original = createDescentSim({ seed: 42 });
    original.step(17);
    const restored = createDescentSim({ seed: 999 });
    restored.load(original.serialize());

    expect(restored.tick).toBe(17);
    expect(restored.seed).toBe(42);
    expect(restored.snapshot()).toEqual(original.snapshot());
    expect(restored.snapshot().units).toEqual([]);
    expect(restored.snapshot().buildings).toEqual([]);
    expect(restored.serialize()).toBe(original.serialize());
  });

  test("a loaded sim continues exactly like the original", () => {
    const original = createDescentSim({ modules: [sandboxModule], seed: 2024 });
    runScript(original, SANDBOX_SCRIPT, 12);
    original.enqueue({
      buildingType: "Mess Hall",
      type: "place_building",
      x: 3,
      y: 3,
    });
    const saved = original.serialize();

    const restored = createDescentSim({ modules: [sandboxModule], seed: 1 });
    restored.load(saved);
    const laterScript = SANDBOX_SCRIPT.filter((entry) => entry.tick >= 12);
    runScript(original, laterScript, 30);
    runScript(restored, laterScript, 30);

    expect(restored.snapshot()).toEqual(original.snapshot());
    expect(restored.serialize()).toBe(original.serialize());
    expect(restored.snapshot().buildings).toHaveLength(2);
  });

  test("restores pause and speed", () => {
    const original = createDescentSim({ seed: 1 });
    original.setSpeed(4);
    original.setPaused(true);
    const restored = createDescentSim({ seed: 1 });
    restored.load(original.serialize());

    expect(restored.paused).toBe(true);
    expect(restored.speed).toBe(4);
  });

  test("writes a versioned envelope", () => {
    const envelope = JSON.parse(createDescentSim({ seed: 1 }).serialize());
    expect(envelope.format).toBe("descent-sim");
    expect(envelope.version).toBe(SIM_SAVE_VERSION);
  });

  test("rejects malformed, foreign, and newer saves", () => {
    const valid = JSON.parse(createDescentSim({ seed: 1 }).serialize());
    const sim = createDescentSim({ seed: 1 });

    const loadError = (save: unknown) =>
      captureError(() =>
        sim.load(typeof save === "string" ? save : JSON.stringify(save)),
      );

    expect(loadError("not json") instanceof DescentSaveError).toBe(true);
    expect(loadError({ ...valid, format: "other" }).message).toBe(
      "Not a Descent sim save",
    );
    expect(loadError({ ...valid, version: SIM_SAVE_VERSION + 1 }).message).toBe(
      `Descent save version ${SIM_SAVE_VERSION + 1} is newer than ${SIM_SAVE_VERSION}`,
    );
    expect(
      loadError({ ...valid, state: { ...valid.state, tick: -1 } }).message,
    ).toBe("Descent save has an invalid tick");
    expect(sim.tick).toBe(0);
  });

  test("runs migrations from older versions", () => {
    const current = JSON.parse(createDescentSim({ seed: 8 }).serialize());
    const legacy = JSON.stringify({
      format: "descent-sim",
      state: { ...current.state, tick: undefined, ticksElapsed: 6 },
      version: 0,
    });
    const migrated = parseSerializedWorld(legacy, {
      0: (state) => {
        const { ticksElapsed, ...rest } = state as { ticksElapsed: number };
        return { ...rest, tick: ticksElapsed };
      },
    });

    expect(captureError(() => parseSerializedWorld(legacy)).message).toBe(
      "No migration from save version 0",
    );
    expect(migrated.tick).toBe(6);
  });
});

describe("autosave", () => {
  test("writes a versioned blob keyed by descent + slot when a layer starts", () => {
    const { storage, values } = createMemoryStorage();
    const sim = createDescentSim({ modules: [sandboxModule], seed: 3 });
    const saves: string[] = [];
    attachLayerAutosave(sim, storage, AUTOSAVE_SLOT, (layerId) =>
      saves.push(layerId),
    );

    sim.step(4);
    expect(values.size).toBe(0);

    sim.enqueue({ type: "descend" });
    sim.step(3);

    expect(saveSlotKey(AUTOSAVE_SLOT)).toBe("descent.save.autosave");
    expect(saves).toEqual(["layer-1"]);
    const blob = readSaveSlot(storage, AUTOSAVE_SLOT);
    expect(blob).not.toBeNull();
    const envelope = JSON.parse(blob as string);
    expect(envelope.version).toBe(SIM_SAVE_VERSION);
    expect(envelope.state.tick).toBe(5);
    expect(envelope.state.layerId).toBe("layer-1");
  });

  test("autosaves the starting layer before the first tick", () => {
    const { storage } = createMemoryStorage();
    const sim = createDescentSim({ layerId: "ashen-gate", seed: 3 });
    attachLayerAutosave(sim, storage);
    sim.step(5);

    const restored = createDescentSim({ seed: 0 });
    restored.load(readSaveSlot(storage, AUTOSAVE_SLOT) as string);
    expect(restored.tick).toBe(0);
    expect(restored.snapshot().layerId).toBe("ashen-gate");
  });

  test("storage failures do not throw", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    const sim = createDescentSim({ seed: 1 });

    expect(writeSaveSlot(blocked, "manual", sim)).toBe(false);
    expect(readSaveSlot(blocked, "manual")).toBeNull();
  });
});
