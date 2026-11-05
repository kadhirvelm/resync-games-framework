import { describe, expect, test } from "bun:test";
import { elevenLabsCall, requestElevenLabsAudio } from "../elevenLabs";

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

  test("falls back to Sound Generation when the Music API needs a paid plan", async () => {
    const urls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const fetchMock = (async (input, init) => {
      urls.push(String(input));
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (urls.length === 1) {
        return new Response(
          JSON.stringify({ detail: { code: "paid_plan_required" } }),
          { headers: { "content-type": "application/json" }, status: 402 },
        );
      }
      return new Response(new Uint8Array(1_200), {
        headers: { "content-type": "audio/mpeg" },
      });
    }) as typeof fetch;

    const rendered = await requestElevenLabsAudio(
      "test-key",
      { cue: "battle", prompt: "Driving instrumental bed", role: "music" },
      fetchMock,
    );

    expect(rendered.bytes.byteLength).toBe(1_200);
    expect(urls[0]).toContain("/v1/music");
    expect(urls[1]).toContain("/v1/sound-generation");
    expect(bodies[1]?.duration_seconds).toBe(30);
    expect(bodies[1]?.loop).toBe(true);
  });

  test("keeps Sound Generation prompts inside the provider limit", () => {
    const call = elevenLabsCall({
      cue: "attack",
      prompt: "a".repeat(500),
      role: "effect",
    });
    expect(String(call.body.text)).toHaveLength(450);
  });
});
