import { describe, expect, test } from "bun:test";
import { trainingPlan } from "../../logic/slice/sliceTraining";
import { shiftTrainQuote } from "../trainingQuote";

const wardenPlan = trainingPlan("warden");
const warden = {
  food: wardenPlan.cost.food ?? 0,
  pop: wardenPlan.pop,
  seconds: wardenPlan.seconds,
  water: wardenPlan.cost.water ?? 0,
};
const each = `${warden.seconds}s each`;

describe("shiftTrainQuote", () => {
  test("prices five when the queue and stockpile can take them", () => {
    expect(
      shiftTrainQuote(
        { food: 500, popFree: 20, queueLength: 0, water: 300 },
        warden,
      ),
    ).toEqual({
      cost: {
        count: 5,
        items: [
          { amount: warden.food * 5, resource: "food" },
          { amount: warden.water * 5, resource: "water" },
          { amount: 5, resource: "population" },
        ],
        seconds: warden.seconds,
        secondsEach: true,
      },
      count: 5,
      detail: `×5 · Food ${warden.food * 5} · Water ${warden.water * 5} · ${each}`,
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
        { food: warden.food * 2 + 10, popFree: 20, queueLength: 0, water: 300 },
        warden,
      )?.detail,
    ).toBe(
      `×2 · Food ${warden.food * 2} · Water ${warden.water * 2} · ${each}`,
    );
    expect(
      shiftTrainQuote(
        { food: 500, popFree: 1, queueLength: 0, water: 300 },
        warden,
      ),
    ).toBeNull();
  });
});
