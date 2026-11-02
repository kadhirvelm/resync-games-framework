import { describe, expect, test } from "bun:test";
import {
  buildFrontendRedirect,
  sanitizeReturnPath,
} from "../productNowReturnPath";

describe("ProductNow return path", () => {
  test("keeps a same-origin frontend path", () => {
    expect(sanitizeReturnPath("/assets?tab=dungeon")).toBe(
      "/assets?tab=dungeon",
    );
    expect(sanitizeReturnPath("/")).toBe("/");
  });

  test("drops paths that could leave the frontend", () => {
    expect(sanitizeReturnPath("https://evil.test")).toBeUndefined();
    expect(sanitizeReturnPath("//evil.test")).toBeUndefined();
    expect(sanitizeReturnPath("/\\evil.test")).toBeUndefined();
    expect(sanitizeReturnPath(" /assets")).toBeUndefined();
    expect(sanitizeReturnPath(undefined)).toBeUndefined();
  });

  test("builds the callback redirect on the frontend origin", () => {
    expect(
      buildFrontendRedirect("https://game.test/", "/play", {
        productNow: "connected",
      }),
    ).toBe("https://game.test/play?productNow=connected");
    expect(
      buildFrontendRedirect("https://game.test", undefined, {
        productNow: "error",
        reason: "access_denied",
      }),
    ).toBe("https://game.test/?productNow=error&reason=access_denied");
  });
});
