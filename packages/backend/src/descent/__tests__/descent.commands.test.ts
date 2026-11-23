import { describe, expect, test } from "bun:test";
import { isDescentWireCommand } from "../descent.commands";

describe("Descent wire commands", () => {
  test("accepts shift-queued building placement", () => {
    expect(
      isDescentWireCommand({
        builderIds: ["villager-1", "villager-2"],
        buildingType: "wall",
        queue: true,
        type: "place_building",
        x: 12,
        y: 8,
      }),
    ).toBe(true);
  });

  test("rejects a non-boolean placement queue flag", () => {
    expect(
      isDescentWireCommand({
        buildingType: "barracks",
        queue: "true",
        type: "place_building",
        x: 12,
        y: 8,
      }),
    ).toBe(false);
  });

  test("accepts call_next_wave with no extra fields", () => {
    expect(isDescentWireCommand({ type: "call_next_wave" })).toBe(true);
    expect(isDescentWireCommand({ extra: true, type: "call_next_wave" })).toBe(
      false,
    );
  });

  test("accepts start_breakthrough with or without hallId", () => {
    expect(
      isDescentWireCommand({
        type: "start_breakthrough",
        unitId: "ashen-captain",
      }),
    ).toBe(true);
    expect(
      isDescentWireCommand({
        hallId: "hall-1",
        type: "start_breakthrough",
        unitId: "warden-1",
      }),
    ).toBe(true);
    expect(
      isDescentWireCommand({
        hallId: 123,
        type: "start_breakthrough",
        unitId: "warden-1",
      }),
    ).toBe(false);
  });
});
