import { describe, expect, test } from "bun:test";
import { elevenLabsCall } from "../elevenLabs";

describe("elevenLabsCall", () => {
  test("asks for an instrumental bed", () => {
    const call = elevenLabsCall({
      cue: "battle",
      prompt: "A driving pentatonic bed",
      role: "music",
    });
    expect(call.url).toContain("/v1/music");
    expect(call.body).toEqual({
      force_instrumental: true,
      model_id: "music_v1",
      music_length_ms: 30_000,
      prompt: "A driving pentatonic bed",
    });
  });

  test("asks for a looping room tone and a one-shot impact", () => {
    const room = elevenLabsCall({
      cue: "room",
      prompt: "Water under a bell chamber",
      role: "ambience",
    });
    expect(room.url).toContain("/v1/sound-generation");
    expect(room.body).toEqual({
      duration_seconds: 12,
      loop: true,
      model_id: "eleven_text_to_sound_v2",
      prompt_influence: 0.5,
      text: "Water under a bell chamber",
    });

    const attack = elevenLabsCall({
      cue: "attack",
      prompt: "An iron bell struck once",
      role: "effect",
    });
    expect(attack.body).toEqual({
      duration_seconds: 1.5,
      loop: false,
      model_id: "eleven_text_to_sound_v2",
      prompt_influence: 0.5,
      text: "An iron bell struck once",
    });
  });
});
