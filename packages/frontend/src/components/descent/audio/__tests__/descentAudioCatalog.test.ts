import { describe, expect, test } from "bun:test";
import type { AudioAsset } from "@resync-game-framework/api";
import {
  ASHEN_GATE_AUDIO,
  ashenGateAudioPrompt,
} from "../../data/layers/ashen_gate/audio";
import {
  audioIdForFx,
  audioIdForNotice,
  musicIdForEncounter,
  resolveDescentAudioCatalog,
} from "../descentAudioCatalog";

/** Builds the minimum complete generated asset used by catalog tests. */
function clip(prompt: string, id: string): AudioAsset {
  return {
    audioUrl: `https://assets.test/${id}.mp3`,
    createdAt: "2026-11-04T00:00:00.000Z",
    cue: "attack",
    design: "test",
    durationSeconds: 1,
    id,
    loop: false,
    prompt,
    role: "effect",
    title: id,
    vendor: "elevenlabs",
  };
}

describe("Descent audio catalog", () => {
  test("resolves only the current exact tagged prompt", () => {
    const spec = ASHEN_GATE_AUDIO.find((entry) => entry.id === "wave-horn");
    if (spec === undefined) throw new Error("Missing wave horn spec");
    const current = clip(ashenGateAudioPrompt(spec), "current");
    const stale = clip(`${ashenGateAudioPrompt(spec)} old`, "stale");
    expect(resolveDescentAudioCatalog([stale, current])["wave-horn"]?.id).toBe(
      "current",
    );
  });

  test("maps combat presentation effects to distinct one-shots", () => {
    expect(
      audioIdForFx({
        from: { x: 0, y: 0 },
        id: 1,
        kind: "projectile",
        sound: "magic",
        tick: 1,
        to: { x: 1, y: 1 },
      }),
    ).toBe("magic-attack");
    expect(
      audioIdForFx({
        amount: 5,
        critical: false,
        id: 2,
        kind: "damage",
        tick: 1,
        x: 1,
        y: 1,
      }),
    ).toBe("combat-impact");
    expect(
      audioIdForFx({
        id: 3,
        kind: "collapse",
        sound: "impact",
        tick: 1,
        x: 1,
        y: 1,
      }),
    ).toBe("combat-impact");
  });

  test("gives villager and soldier births their own cues", () => {
    const birth = (sound: "soldier" | "villager") =>
      audioIdForFx({ id: 4, kind: "spawn", sound, tick: 1, x: 1, y: 1 });
    expect(birth("villager")).toBe("villager-born");
    expect(birth("soldier")).toBe("soldier-born");
  });

  test("has no click cue for issuing commands", () => {
    expect(
      ASHEN_GATE_AUDIO.map((spec) => spec.id as string).includes("command"),
    ).toBe(false);
  });

  test("scores calm, combat, boss, and denied states", () => {
    expect(musicIdForEncounter({ boss: false, liveEnemies: 0 })).toBe(
      "hold-music",
    );
    expect(musicIdForEncounter({ boss: false, liveEnemies: 2 })).toBe(
      "battle-music",
    );
    expect(musicIdForEncounter({ boss: true, liveEnemies: 1 })).toBe(
      "boss-music",
    );
    expect(audioIdForNotice({ id: 1, text: "No", tone: "warn" })).toBe(
      "denied",
    );
  });
});
