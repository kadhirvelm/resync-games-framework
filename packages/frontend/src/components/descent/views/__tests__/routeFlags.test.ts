import { describe, expect, test } from "bun:test";
import { routePlan } from "../routeFlags";

describe("routePlan", () => {
  test("draws nothing for units standing still", () => {
    expect(
      routePlan([
        { x: 1, y: 1 },
        { route: [], x: 2, y: 2 },
      ]),
    ).toEqual({
      flags: [],
      path: [],
    });
  });

  test("one unit gets a numbered flag per leg and a path through them", () => {
    const plan = routePlan([
      {
        route: [
          { attack: false, x: 10, y: 0 },
          { attack: true, x: 10, y: 10 },
        ],
        x: 0,
        y: 0,
      },
    ]);
    expect(plan.flags).toEqual([
      { attack: false, order: 1, x: 10, y: 0 },
      { attack: true, order: 2, x: 10, y: 10 },
    ]);
    expect(plan.path).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  test("a squad's formation slots for one click merge into one flag", () => {
    const plan = routePlan([
      { route: [{ attack: false, x: 20, y: 9 }], x: 0, y: 0 },
      { route: [{ attack: false, x: 20, y: 11 }], x: 0, y: 2 },
      { route: [{ attack: false, x: 21, y: 10 }], x: 1, y: 1 },
    ]);
    expect(plan.flags).toHaveLength(1);
    expect(plan.flags[0]?.x).toBeCloseTo(20.33, 1);
    expect(plan.flags[0]?.y).toBeCloseTo(10, 5);
  });

  test("units sent to far-apart points keep separate flags", () => {
    const plan = routePlan([
      { route: [{ attack: false, x: 0, y: 30 }], x: 0, y: 0 },
      { route: [{ attack: false, x: 30, y: 0 }], x: 0, y: 0 },
    ]);
    expect(plan.flags).toHaveLength(2);
  });
});
