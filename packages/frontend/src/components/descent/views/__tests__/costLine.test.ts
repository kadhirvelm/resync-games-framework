import { describe, expect, test } from "bun:test";
import {
  costLineFrom,
  costLineText,
  isCostItemShort,
  isCostLineShort,
} from "../costLine";

describe("cost line", () => {
  test("orders resources like the stockpile and puts population last", () => {
    expect(
      costLineFrom({ food: 0, stone: 40, wood: 40 }, { pop: 1, seconds: 11.6 }),
    ).toEqual({
      items: [
        { amount: 40, resource: "wood" },
        { amount: 40, resource: "stone" },
        { amount: 1, resource: "population" },
      ],
      seconds: 12,
    });
  });

  test("marks only the amounts the player is short of", () => {
    const line = costLineFrom({ stone: 40, wood: 40 }, { pop: 2 });
    const stock = { popFree: 1, resources: { stone: 10, wood: 60 } };
    expect(line.items.map((item) => isCostItemShort(item, stock))).toEqual([
      false,
      true,
      true,
    ]);
    expect(isCostLineShort(line, stock)).toBe(true);
    expect(
      isCostLineShort(line, {
        popFree: null,
        resources: { stone: 40, wood: 40 },
      }),
    ).toBe(false);
  });

  test("spells the price out without any Need wording", () => {
    expect(
      costLineText(
        costLineFrom(
          { food: 150, water: 75 },
          { count: 5, seconds: 4, secondsEach: true },
        ),
      ),
    ).toBe("5 orders, Food 150, Water 75, 4 seconds each");
    expect(costLineText(costLineFrom({}))).toBe("Free");
  });
});
