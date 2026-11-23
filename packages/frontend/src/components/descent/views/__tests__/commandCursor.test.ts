import { describe, expect, test } from "bun:test";
import {
  type CommandCursorInput,
  commandCursorFor,
  commandCursorKind,
} from "../commandCursor";

const units = [
  {
    classId: "villager",
    factionId: "hold" as const,
    id: "villager",
    x: 1,
    y: 1,
  },
  {
    classId: "warden",
    factionId: "hold" as const,
    id: "warden",
    x: 2,
    y: 1,
  },
  {
    classId: "raider",
    factionId: "horde" as const,
    id: "enemy",
    x: 8,
    y: 8,
  },
];
const buildings = [
  { factionId: "hold" as const, id: "site" },
  {
    constructing: false,
    factionId: "hold" as const,
    hitPoints: 200,
    id: "done-camp",
    maxHitPoints: 200,
  },
  {
    constructing: false,
    factionId: "hold" as const,
    hitPoints: 120,
    id: "damaged-camp",
    maxHitPoints: 200,
  },
  {
    constructing: true,
    factionId: "hold" as const,
    hitPoints: 50,
    id: "under-construction",
    maxHitPoints: 200,
  },
  { factionId: "horde" as const, id: "gate" },
];
const nodes = [
  { id: "grove", resource: "wood", x: 5, y: 5 },
  { id: "stone", resource: "stone", x: 6, y: 6 },
  { id: "gold", resource: "gold", x: 7, y: 7 },
  { id: "coin", resource: "coin", x: 8, y: 8 },
  { id: "essence", resource: "essence", x: 9, y: 9 },
  { id: "food", resource: "food", x: 10, y: 10 },
  { id: "water", resource: "water", x: 11, y: 11 },
  { id: "herbs", resource: "spirit_herbs", x: 12, y: 12 },
];

/**
 * @param overrides - Fields that differ from a villager over open ground
 * @returns Complete cursor-rule input
 */
function cursorInput(
  overrides: Partial<CommandCursorInput> = {},
): CommandCursorInput {
  return {
    buildings,
    ground: { x: 20, y: 20 },
    nodes,
    placing: false,
    selectedIds: ["villager"],
    targetBuildingId: null,
    targetUnitId: null,
    units,
    ...overrides,
  };
}

describe("command cursors", () => {
  test("uses a sword only when selected soldiers can attack the target", () => {
    expect(
      commandCursorKind(
        cursorInput({ selectedIds: ["warden"], targetUnitId: "enemy" }),
      ),
    ).toBe("attack");
    expect(
      commandCursorKind(
        cursorInput({ selectedIds: ["warden"], targetBuildingId: "gate" }),
      ),
    ).toBe("attack");
    expect(commandCursorKind(cursorInput({ targetUnitId: "enemy" }))).toBe(
      "move",
    );
  });

  test("uses an axe for wood and a pick for stone or gold", () => {
    expect(commandCursorKind(cursorInput({ ground: { x: 5, y: 5 } }))).toBe(
      "wood",
    );
    expect(commandCursorKind(cursorInput({ ground: { x: 6, y: 6 } }))).toBe(
      "mineral",
    );
    expect(commandCursorKind(cursorInput({ ground: { x: 7, y: 7 } }))).toBe(
      "mineral",
    );
    expect(commandCursorKind(cursorInput({ ground: { x: 8, y: 8 } }))).toBe(
      "mineral",
    );
    expect(commandCursorKind(cursorInput({ ground: { x: 9, y: 9 } }))).toBe(
      "mineral",
    );
  });

  test("uses a gather cursor for food, water, and spirit herbs", () => {
    expect(commandCursorKind(cursorInput({ ground: { x: 10, y: 10 } }))).toBe(
      "gather",
    );
    expect(commandCursorKind(cursorInput({ ground: { x: 11, y: 11 } }))).toBe(
      "gather",
    );
    expect(commandCursorKind(cursorInput({ ground: { x: 12, y: 12 } }))).toBe(
      "gather",
    );
    expect(
      commandCursorFor(cursorInput({ ground: { x: 10, y: 10 } })),
    ).toContain('url("data:image/svg+xml,');
  });

  test("uses a hammer for Hold construction, repair, and active placement, but not completed full-HP buildings", () => {
    expect(commandCursorKind(cursorInput({ targetBuildingId: "site" }))).toBe(
      "build",
    );
    expect(
      commandCursorKind(
        cursorInput({ targetBuildingId: "under-construction" }),
      ),
    ).toBe("build");
    expect(
      commandCursorKind(cursorInput({ targetBuildingId: "damaged-camp" })),
    ).toBe("build");
    expect(
      commandCursorKind(cursorInput({ targetBuildingId: "done-camp" })),
    ).toBe("move");
    expect(
      commandCursorKind(
        cursorInput({
          ground: null,
          placing: true,
          selectedIds: [],
          targetUnitId: "enemy",
        }),
      ),
    ).toBe("build");
  });

  test("keeps the default cursor for movement and unavailable commands", () => {
    expect(commandCursorFor(cursorInput())).toBe("default");
    expect(commandCursorFor(cursorInput({ selectedIds: [] }))).toBe("default");
    expect(commandCursorFor(cursorInput({ ground: null }))).toBe("default");
    expect(
      commandCursorFor(
        cursorInput({ ground: { x: 5, y: 5 }, selectedIds: ["warden"] }),
      ),
    ).toBe("default");
  });

  test("respects local ownership before offering a command cursor", () => {
    expect(
      commandCursorKind(
        cursorInput({
          ground: { x: 5, y: 5 },
          localPlayerId: "player-two",
        }),
      ),
    ).toBe("move");
  });

  test("emits encoded SVG cursors with a safe CSS fallback", () => {
    const cursor = commandCursorFor(
      cursorInput({ selectedIds: ["warden"], targetUnitId: "enemy" }),
    );
    expect(cursor).toContain('url("data:image/svg+xml,');
    expect(cursor).toContain("%3Csvg");
    expect(cursor.endsWith("3 3, default")).toBe(true);
  });
});
