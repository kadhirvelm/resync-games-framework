import { describe, expect, test } from "bun:test";
import { CULTIVATOR_NAME_MAX_LENGTH } from "@resync-game-framework/api";
import {
  DEFAULT_CULTIVATOR_TITLE,
  readCultivatorChanges,
  readCultivatorFields,
} from "../cultivatorFields";

describe("readCultivatorFields", () => {
  test("trims fields and folds whitespace in one-line fields", () => {
    expect(
      readCultivatorFields({
        appearance: "  Silver hair.\nA jade hairpin.  ",
        name: "  Lin   Wei ",
        title: " Keeper of  Ash ",
      }),
    ).toEqual({
      appearance: "Silver hair.\nA jade hairpin.",
      name: "Lin Wei",
      title: "Keeper of Ash",
    });
  });

  test("uses the default title when it is blank", () => {
    expect(readCultivatorFields({ name: "Lin" }).title).toBe(
      DEFAULT_CULTIVATOR_TITLE,
    );
  });

  test("rejects a blank or overlong name", () => {
    expect(() => readCultivatorFields({ name: "   " })).toThrow();
    expect(() =>
      readCultivatorFields({
        name: "x".repeat(CULTIVATOR_NAME_MAX_LENGTH + 1),
      }),
    ).toThrow();
  });
});

describe("readCultivatorChanges", () => {
  test("keeps only the fields that were sent", () => {
    expect(readCultivatorChanges({ appearance: " Tall " })).toEqual({
      appearance: "Tall",
    });
  });

  test("rejects clearing the name", () => {
    expect(() => readCultivatorChanges({ name: "" })).toThrow();
  });
});
