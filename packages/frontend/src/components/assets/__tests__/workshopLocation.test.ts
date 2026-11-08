import { describe, expect, test } from "bun:test";
import {
  hrefWithGenerator,
  readGeneratorFromSearch,
} from "../workshopLocation";

const ids = ["dungeons", "audio", "static-images"];

describe("readGeneratorFromSearch", () => {
  test("returns a known generator from the query", () => {
    expect(readGeneratorFromSearch("?generator=audio", ids)).toBe("audio");
    expect(readGeneratorFromSearch("generator=dungeons&x=1", ids)).toBe(
      "dungeons",
    );
  });

  test("ignores missing and unknown generators", () => {
    expect(readGeneratorFromSearch("", ids)).toBeNull();
    expect(readGeneratorFromSearch("?generator=nope", ids)).toBeNull();
  });
});

describe("hrefWithGenerator", () => {
  test("sets the generator and keeps other query values and the hash", () => {
    expect(
      hrefWithGenerator("https://localhost:3000/assets?x=1#top", "audio"),
    ).toBe("/assets?x=1&generator=audio#top");
  });

  test("replaces an existing generator", () => {
    expect(
      hrefWithGenerator(
        "https://localhost:3000/assets?generator=dungeons",
        "static-images",
      ),
    ).toBe("/assets?generator=static-images");
  });
});
