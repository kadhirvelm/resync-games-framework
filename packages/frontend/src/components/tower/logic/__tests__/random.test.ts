import { describe, expect, test } from "bun:test";
import { SeededRandom } from "../random";

describe("SeededRandom", () => {
  test("the same seed gives the same sequence", () => {
    const left = new SeededRandom(11);
    const right = new SeededRandom(11);
    expect([left.next(), left.next(), left.int(10)]).toEqual([
      right.next(),
      right.next(),
      right.int(10),
    ]);
  });

  test("shuffle keeps every entry and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const shuffled = new SeededRandom(4).shuffle(input);
    expect([...shuffled].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("pick returns undefined for an empty list", () => {
    expect(new SeededRandom(1).pick([])).toBeUndefined();
  });
});
