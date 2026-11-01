import { describe, expect, test } from "bun:test";
import type { CombatEvent } from "../../tower/logic/combat";
import { DASH_IMPACT_MS, scheduleStep } from "../stepTimeline";

/**
 * @param sourceId - Attacker
 * @param targetId - Unit hit
 * @returns A damage event
 */
function hit(sourceId: string, targetId: string): CombatEvent {
  return { blocked: 0, dealt: 4, kind: "damage", sourceId, targetId };
}

describe("scheduleStep", () => {
  test("an attacker dashes before its blow lands", () => {
    const timeline = scheduleStep(
      [
        { cardId: "c", kind: "card-played", ownerId: "mira" },
        hit("mira", "wolf"),
      ],
      1,
    );
    const blow = timeline.beats[1];
    expect(blow?.windupAt).toBeDefined();
    expect((blow?.at ?? 0) - (blow?.windupAt ?? 0)).toBe(DASH_IMPACT_MS);
    expect(timeline.duration).toBeGreaterThan(blow?.at ?? 0);
  });

  test("a flurry from one attacker dashes once", () => {
    const timeline = scheduleStep(
      [hit("wolf", "a"), hit("wolf", "b"), hit("wolf", "c")],
      1,
    );
    const [first, second, third] = timeline.beats;
    expect(first?.windupAt).toBeDefined();
    expect(second?.windupAt).toBeUndefined();
    expect(third?.windupAt).toBeUndefined();
    expect(second?.at).toBeGreaterThan(first?.at ?? 0);
    expect(third?.at).toBeGreaterThan(second?.at ?? 0);
  });

  test("self-inflicted damage lands at once", () => {
    const timeline = scheduleStep([hit("mira", "mira")], 1);
    expect(timeline.beats[0]?.at).toBe(0);
    expect(timeline.beats[0]?.windupAt).toBeUndefined();
  });

  test("a faster battle speed shortens every beat", () => {
    const events = [hit("mira", "wolf"), hit("wolf", "mira")];
    const normal = scheduleStep(events, 1);
    const fast = scheduleStep(events, 0.5);
    expect(fast.duration).toBeLessThan(normal.duration);
    expect(fast.beats[1]?.at).toBeLessThan(normal.beats[1]?.at ?? 0);
  });

  test("an empty step takes no time", () => {
    expect(scheduleStep([], 1)).toEqual({ beats: [], duration: 0 });
  });
});
