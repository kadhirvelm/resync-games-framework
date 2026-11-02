import { describe, expect, test } from "bun:test";
import { shiftTrainQuote } from "../trainingQuote";

const warden = { food: 30, pop: 1, seconds: 4, water: 15 };

describe("shiftTrainQuote", () => {
  test("prices five when the queue and stockpile can take them", () => {
    expect(
      shiftTrainQuote(
        { food: 500, popFree: 20, queueLength: 0, water: 300 },
        warden,
      ),
    ).toEqual({
      count: 5,
      detail: "×5 · Food 150 · Water 75 · 4s each",
    });
  });

  test("stops at the queue room, the food, or the population", () => {
    expect(
      shiftTrainQuote(
        { food: 500, popFree: 20, queueLength: 18, water: 300 },
        warden,
      )?.count,
    ).toBe(2);
    expect(
      shiftTrainQuote(
        { food: 70, popFree: 20, queueLength: 0, water: 300 },
        warden,
      )?.detail,
    ).toBe("×2 · Food 60 · Water 30 · 4s each");
    expect(
      shiftTrainQuote(
        { food: 500, popFree: 1, queueLength: 0, water: 300 },
        warden,
      ),
    ).toBeNull();
  });
});
