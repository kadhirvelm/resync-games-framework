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

  test("offers resume only for a valid stored 2D climb", () => {
    const storedClimb = JSON.stringify({
      jadeSpire: {
        battleNumber: 2,
        content: { coreborn: [], id: "jadeSpire" },
        run: {
          floorIndex: 1,
          modifiers: {},
          party: [],
          phase: "camp",
          rooms: [{}],
        },
        savedAt: 42,
        version: 1,
      },
    });
    const storage = {
      getItem: (key: string) =>
        key === "towers-of-coreborn.saves.v1" ? storedClimb : null,
    };

    expect(hasStoredTowerClimb(storage)).toBe(true);
    expect([...getResumeExperienceIds(storage)]).toEqual([
      "towers-of-coreborn",
    ]);
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
