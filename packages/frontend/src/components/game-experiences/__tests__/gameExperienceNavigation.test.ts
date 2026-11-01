import { describe, expect, test } from "bun:test";
import {
  type ExperienceNavigationState,
  experienceNavigationReducer,
} from "../gameExperienceTypes";
import {
  getResumeExperienceIds,
  hasStoredTowerClimb,
} from "../resumeAvailability";

describe("experience navigation", () => {
  test("opens each runtime and returns to the selector", () => {
    let state: ExperienceNavigationState = null;

    state = experienceNavigationReducer(state, {
      id: "towers-of-coreborn",
      type: "open",
    });
    expect(state).toBe("towers-of-coreborn");

    state = experienceNavigationReducer(state, { type: "close" });
    expect(state).toBeNull();

    state = experienceNavigationReducer(state, {
      id: "three-d-sandbox",
      type: "open",
    });
    expect(state).toBe("three-d-sandbox");
  });

  test("offers resume only when the game has mirrored a saved climb", () => {
    const storage = {
      getItem: (key: string) =>
        key === "towers-of-coreborn.saved-climbs.v1"
          ? JSON.stringify(["4f1c0b2e-6a7d-4c8e-9f10-123456789abc"])
          : null,
    };
    const empty = { getItem: () => "[]" };

    expect(hasStoredTowerClimb(storage)).toBe(true);
    expect([...getResumeExperienceIds(storage)]).toEqual([
      "towers-of-coreborn",
    ]);
    expect(hasStoredTowerClimb(empty)).toBe(false);
  });

  test("ignores malformed or inaccessible save data", () => {
    const malformedStorage = { getItem: () => "not-json" };
    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };

    expect(hasStoredTowerClimb(malformedStorage)).toBe(false);
    expect(hasStoredTowerClimb(blockedStorage)).toBe(false);
  });
});
