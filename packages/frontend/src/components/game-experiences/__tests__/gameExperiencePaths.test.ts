import { describe, expect, test } from "bun:test";
import {
  gameExperiencePath,
  isGameExperienceId,
  legacyExperienceRedirectTarget,
  threeDSandboxHref,
} from "../gameExperiencePaths";

describe("game experience paths", () => {
  test("gives each game its own path", () => {
    expect(gameExperiencePath("towers-of-coreborn")).toBe(
      "/towers-of-coreborn",
    );
    expect(gameExperiencePath("descent")).toBe("/descent");
    expect(gameExperiencePath("three-d-sandbox")).toBe("/three-d-sandbox");
    expect(isGameExperienceId("assets")).toBe(false);
  });

  test("keeps playground deep links on the 3D path", () => {
    expect(threeDSandboxHref()).toBe("/three-d-sandbox");
    expect(threeDSandboxHref({ prototype: "garden" })).toBe(
      "/three-d-sandbox?prototype=garden",
    );
    expect(threeDSandboxHref({ asset: "lantern", kind: "prop" })).toBe(
      "/three-d-sandbox?asset=lantern&kind=prop",
    );
  });

  test("redirects an old library query onto the game path", () => {
    expect(legacyExperienceRedirectTarget({ experience: "descent" })).toBe(
      "/descent",
    );
    expect(
      legacyExperienceRedirectTarget({
        asset: "lantern",
        experience: "three-d-sandbox",
        kind: "prop",
      }),
    ).toBe("/three-d-sandbox?asset=lantern&kind=prop");
    expect(legacyExperienceRedirectTarget({})).toBeNull();
    expect(
      legacyExperienceRedirectTarget({ experience: "missing" }),
    ).toBeNull();
  });
});
