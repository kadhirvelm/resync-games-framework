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

  test("accepts construction cancellation with only its building id", () => {
    expect(
      isDescentWireCommand({
        buildingId: "building-1",
        type: "cancel_construction",
      }),
    ).toBe(true);
    expect(isDescentWireCommand({ type: "cancel_construction" })).toBe(false);
    expect(
      isDescentWireCommand({
        buildingId: "building-1",
        jobId: "training-1",
        type: "cancel_construction",
      }),
    ).toBe(false);
  });

  for (const type of ["toggle_meditate", "cast_qi_art", "disband_units"]) {
    describe(type, () => {
      test("accepts bounded lists of unit ids", () => {
        expect(
          isDescentWireCommand({
            type,
            unitIds: ["cultivator-1", "cultivator-2"],
          }),
        ).toBe(true);
        expect(isDescentWireCommand({ type, unitIds: [] })).toBe(true);
        expect(
          isDescentWireCommand({
            type,
            unitIds: Array(512).fill("x".repeat(128)),
          }),
        ).toBe(true);
      });

      for (const [label, command] of [
        ["missing unitIds", { type }],
        ["non-array unitIds", { type, unitIds: "cultivator-1" }],
        ["mixed array", { type, unitIds: ["cultivator-1", 1] }],
        ["empty id", { type, unitIds: [""] }],
        ["oversized id", { type, unitIds: ["x".repeat(129)] }],
        ["too many ids", { type, unitIds: Array(513).fill("unit") }],
        ["extra field", { targetId: "enemy", type, unitIds: ["cultivator-1"] }],
      ] as const) {
        test(`rejects ${label}`, () => {
          expect(isDescentWireCommand(command)).toBe(false);
        });
      }
    });
  }

  for (const classId of ["cultivator", "sword_sage", "formation_master"]) {
    describe(`train_unit ${classId}`, () => {
      test("accepts the class with an optional bounded count", () => {
        expect(
          isDescentWireCommand({
            buildingId: "sanctum-1",
            classId,
            type: "train_unit",
          }),
        ).toBe(true);
        for (const count of [1, 5]) {
          expect(
            isDescentWireCommand({
              buildingId: "sanctum-1",
              classId,
              count,
              type: "train_unit",
            }),
          ).toBe(true);
        }
      });

      for (const [label, command] of [
        ["missing buildingId", { classId, type: "train_unit" }],
        ["empty buildingId", { buildingId: "", classId, type: "train_unit" }],
        [
          "non-string buildingId",
          { buildingId: 1, classId, type: "train_unit" },
        ],
        [
          "count below range",
          { buildingId: "sanctum-1", classId, count: 0, type: "train_unit" },
        ],
        [
          "count above range",
          { buildingId: "sanctum-1", classId, count: 6, type: "train_unit" },
        ],
        [
          "fractional count",
          { buildingId: "sanctum-1", classId, count: 1.5, type: "train_unit" },
        ],
        [
          "non-number count",
          { buildingId: "sanctum-1", classId, count: "2", type: "train_unit" },
        ],
        [
          "extra field",
          { buildingId: "sanctum-1", classId, extra: true, type: "train_unit" },
        ],
      ] as const) {
        test(`rejects ${label}`, () => {
          expect(isDescentWireCommand(command)).toBe(false);
        });
      }
    });
  }

  for (const [label, command] of [
    ["missing classId", { buildingId: "sanctum-1", type: "train_unit" }],
    [
      "unknown classId",
      {
        buildingId: "sanctum-1",
        classId: "cultivator_master",
        type: "train_unit",
      },
    ],
    [
      "non-string classId",
      { buildingId: "sanctum-1", classId: 123, type: "train_unit" },
    ],
  ] as const) {
    test(`rejects train_unit with ${label}`, () => {
      expect(isDescentWireCommand(command)).toBe(false);
    });
  }

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
