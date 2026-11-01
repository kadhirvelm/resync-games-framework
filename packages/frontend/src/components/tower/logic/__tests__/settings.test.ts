import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, parseSettings } from "../settings";

describe("parseSettings", () => {
  test("missing or broken settings fall back to defaults", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("loud")).toEqual(DEFAULT_SETTINGS);
  });

  test("valid fields are kept and the rest repaired", () => {
    expect(
      parseSettings({
        battleSpeed: "ludicrous",
        music: "loud",
        muted: true,
        reducedMotion: "yes",
        volume: 4,
      }),
    ).toEqual({
      battleSpeed: "normal",
      music: true,
      muted: true,
      reducedMotion: false,
      volume: 1,
    });
    expect(parseSettings({ battleSpeed: "swift" }).battleSpeed).toBe("swift");
    expect(parseSettings({ music: false }).music).toBe(false);
  });
});
