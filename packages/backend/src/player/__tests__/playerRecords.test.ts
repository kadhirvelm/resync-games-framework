import { describe, expect, test } from "bun:test";
import {
  INTERRUPTED_PAINTING_ERROR,
  MISSING_ART_ERROR,
  PAINTING_STALE_AFTER_MS,
  readArtState,
} from "../playerRecords";

const NOW = 10_000_000;
const ASSET = { id: "sheet" };

describe("readArtState", () => {
  test("keeps a recent painting run and the art it is replacing", () => {
    expect(
      readArtState(
        { error: null, status: "painting" },
        ASSET,
        new Date(NOW - 1000),
        NOW,
      ),
    ).toEqual({ asset: ASSET, status: "painting" });
  });

  test("reports a stale painting run as interrupted", () => {
    expect(
      readArtState(
        { error: null, status: "painting" },
        undefined,
        new Date(NOW - PAINTING_STALE_AFTER_MS - 1),
        NOW,
      ),
    ).toEqual({
      asset: undefined,
      error: INTERRUPTED_PAINTING_ERROR,
      status: "failed",
    });
  });

  test("reports ready art whose files are gone as failed", () => {
    expect(
      readArtState({ error: null, status: "ready" }, undefined, null, NOW),
    ).toEqual({ error: MISSING_ART_ERROR, status: "failed" });
  });

  test("reads an unknown status as none", () => {
    expect(
      readArtState({ error: null, status: "glowing" }, undefined, null, NOW),
    ).toEqual({ asset: undefined, status: "none" });
  });
});
