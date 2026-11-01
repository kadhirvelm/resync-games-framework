import { describe, expect, test } from "bun:test";
import {
  defaultAudioSlotId,
  defaultScoreSlotId,
  withDungeonAudio,
} from "../dungeonAudioPlan";
import type { StoredDungeonBlueprint } from "../dungeonBlueprint";

const DUNGEON_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("withDungeonAudio", () => {
  test("adds room tone, an attack, and the package score once", () => {
    const stored = packageWithRoomAndEnemy();
    const filled = withDungeonAudio(stored);
    const again = withDungeonAudio(filled);

    expect(again).toBe(filled);
    expect(filled.slots.map((slot) => slot.kind)).toEqual([
      "battle-background",
      "audio",
      "enemy",
      "audio",
      "audio",
      "audio",
      "audio",
      "audio",
      "audio",
      "audio",
    ]);
    const room = filled.slots[1];
    const attack = filled.slots[3];
    const camp = filled.slots[4];
    const reward = filled.slots[filled.slots.length - 1];
    if (
      room?.kind !== "audio" ||
      attack?.kind !== "audio" ||
      camp?.kind !== "audio" ||
      reward?.kind !== "audio"
    ) {
      throw new Error("expected audio slots");
    }
    expect(room).toEqual({
      cue: "room",
      id: defaultAudioSlotId("room", "room"),
      kind: "audio",
      loop: true,
      ownerSlotId: "room",
      prompt: room.prompt,
      role: "ambience",
      status: "planned",
      title: "Bell chamber ambience",
    });
    expect(attack.cue).toBe("attack");
    expect(attack.id).toBe(defaultAudioSlotId("beast", "attack"));
    expect(attack.loop).toBe(false);
    expect(attack.ownerSlotId).toBe("beast");
    expect(attack.role).toBe("effect");
    expect(camp.cue).toBe("camp");
    expect(camp.id).toBe(defaultScoreSlotId(DUNGEON_ID, "camp"));
    expect(camp.role).toBe("music");
    expect(reward.cue).toBe("reward");
    expect(reward.role).toBe("effect");
  });
});

/**
 * @returns A package with one room and one enemy
 */
function packageWithRoomAndEnemy(): StoredDungeonBlueprint {
  return {
    createdAt: "2026-10-18T00:00:00.000Z",
    id: DUNGEON_ID,
    prompt: "A drowned bell tower",
    slots: [
      {
        id: "room",
        kind: "battle-background",
        prompt: "A flooded bell chamber",
        status: "planned",
        title: "Bell chamber",
      },
      {
        id: "beast",
        kind: "enemy",
        prompt: "A moss-covered bell beast",
        status: "planned",
        title: "Bell beast",
      },
    ],
    summary: "A drowned belfry.",
  };
}
