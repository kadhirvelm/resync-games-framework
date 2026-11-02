import { describe, expect, test } from "bun:test";
import {
  EMPTY_SELECTION,
  idleVillagerIds,
  nextIdleVillager,
  nodeNear,
  orderMarkerFor,
  ordersForRightClick,
  placementBuilders,
  rallyCommand,
  selectionGroups,
  similarVisibleUnitIds,
} from "../selection";

const units = [
  {
    classId: "villager",
    factionId: "hold" as const,
    id: "v1",
    idle: true,
    x: 1,
    y: 1,
  },
  {
    classId: "villager",
    factionId: "hold" as const,
    id: "v2",
    idle: false,
    x: 2,
    y: 1,
  },
  {
    classId: "warden",
    factionId: "hold" as const,
    id: "w1",
    idle: false,
    x: 3,
    y: 1,
  },
  {
    classId: "raider",
    factionId: "horde" as const,
    id: "imp",
    idle: false,
    x: 9,
    y: 9,
  },
];
const buildings = [
  { factionId: "hold" as const, id: "site" },
  { factionId: "horde" as const, id: "nest" },
];
const nodes = [{ id: "wood", x: 10, y: 4 }];

/**
 * @param overrides - Fields that differ from an empty ground click
 * @returns Right-click input
 */
function click(overrides: Partial<Parameters<typeof ordersForRightClick>[0]>) {
  return {
    buildings,
    ground: { x: 20, y: 20 },
    nodes,
    selectedIds: ["v1", "w1"],
    targetBuildingId: null,
    targetUnitId: null,
    units,
    ...overrides,
  };
}

describe("ordersForRightClick", () => {
  test("moves everyone on open ground", () => {
    expect(ordersForRightClick(click({}))).toEqual([
      { type: "order_move", unitIds: ["v1", "w1"], x: 20, y: 20 },
    ]);
  });

  test("villagers gather a node near the click; soldiers walk there", () => {
    expect(ordersForRightClick(click({ ground: { x: 10.5, y: 4.4 } }))).toEqual(
      [
        { nodeId: "wood", type: "assign_gather", unitIds: ["v1"] },
        { type: "order_move", unitIds: ["w1"], x: 10.5, y: 4.4 },
      ],
    );
  });

  test("villagers build a Hold building", () => {
    expect(
      ordersForRightClick(
        click({ selectedIds: ["v1", "v2"], targetBuildingId: "site" }),
      ),
    ).toEqual([
      { buildingId: "site", type: "assign_build", unitIds: ["v1", "v2"] },
    ]);
  });

  test("soldiers attack enemies; villagers alone ignore them", () => {
    expect(ordersForRightClick(click({ targetUnitId: "imp" }))).toEqual([
      { targetId: "imp", type: "order_attack", unitIds: ["w1"] },
    ]);
    expect(ordersForRightClick(click({ targetBuildingId: "nest" }))[0]).toEqual(
      {
        targetId: "nest",
        type: "order_attack",
        unitIds: ["w1"],
      },
    );
    expect(
      ordersForRightClick(click({ selectedIds: ["v1"], targetUnitId: "imp" })),
    ).toEqual([]);
  });

  test("returns nothing when no Hold unit is selected", () => {
    expect(ordersForRightClick(click({ selectedIds: ["imp"] }))).toEqual([]);
  });
});

describe("selection helpers", () => {
  test("nodeNear only hits within the click radius", () => {
    expect(nodeNear(nodes, { x: 11, y: 5 })?.id).toBe("wood");
    expect(nodeNear(nodes, { x: 13, y: 4 })).toBeNull();
  });

  test("cycles idle villagers", () => {
    const roster = [
      ...units,
      { classId: "villager", factionId: "hold", id: "v3", idle: true },
    ];
    const idle = idleVillagerIds(roster);
    expect(idle).toEqual(["v1", "v3"]);
    expect(nextIdleVillager(idle, EMPTY_SELECTION)).toBe("v1");
    expect(nextIdleVillager(idle, { buildingId: null, unitIds: ["v1"] })).toBe(
      "v3",
    );
    expect(nextIdleVillager(idle, { buildingId: null, unitIds: ["v3"] })).toBe(
      "v1",
    );
    expect(nextIdleVillager([], EMPTY_SELECTION)).toBeNull();
  });

  test("placement uses selected villagers, else drafts idle ones", () => {
    expect(
      placementBuilders(units, { buildingId: null, unitIds: ["v2", "w1"] }),
    ).toEqual(["v2"]);
    expect(placementBuilders(units, EMPTY_SELECTION)).toEqual(["v1"]);
  });
});

describe("orderMarkerFor", () => {
  const nodes = [{ id: "food", x: 10, y: 13 }];
  const buildings = [{ id: "camp", x: 6, y: 20 }];
  const units = [{ id: "imp", x: 30, y: 20 }];

  test("marks a move where the click landed", () => {
    expect(
      orderMarkerFor({
        buildings,
        ground: { x: 14.5, y: 22.25 },
        nodes,
        orders: [{ type: "order_move", unitIds: ["v1"], x: 14.5, y: 22.25 }],
        units,
      }),
    ).toEqual({ kind: "move", point: { x: 14.5, y: 22.25 } });
  });

  test("marks gather, build, and attack on their targets", () => {
    const ground = { x: 11, y: 12 };
    expect(
      orderMarkerFor({
        buildings,
        ground,
        nodes,
        orders: [{ nodeId: "food", type: "assign_gather", unitIds: ["v1"] }],
        units,
      }),
    ).toEqual({ kind: "gather", point: { x: 10, y: 13 } });
    expect(
      orderMarkerFor({
        buildings,
        ground,
        nodes,
        orders: [{ buildingId: "camp", type: "assign_build", unitIds: ["v1"] }],
        units,
      }),
    ).toEqual({ kind: "build", point: { x: 6, y: 20 } });
    expect(
      orderMarkerFor({
        buildings,
        ground,
        nodes,
        orders: [{ targetId: "imp", type: "order_attack", unitIds: ["w1"] }],
        units,
      }),
    ).toEqual({ kind: "attack", point: { x: 30, y: 20 } });
  });

  test("shows nothing when the click produced no order", () => {
    expect(
      orderMarkerFor({
        buildings,
        ground: { x: 1, y: 1 },
        nodes,
        orders: [],
        units,
      }),
    ).toBeNull();
  });
});

describe("rallyCommand", () => {
  const nodes = [{ id: "wood", x: 14, y: 9 }];

  test("snaps onto a resource node under the point", () => {
    expect(rallyCommand("camp", { x: 14.6, y: 9.4 }, nodes)).toEqual({
      buildingId: "camp",
      nodeId: "wood",
      type: "set_rally_point",
      x: 14,
      y: 9,
    });
  });

  test("keeps a plain ground point", () => {
    expect(rallyCommand("camp", { x: 20, y: 20 }, nodes)).toEqual({
      buildingId: "camp",
      type: "set_rally_point",
      x: 20,
      y: 20,
    });
  });
});

describe("similarVisibleUnitIds", () => {
  const units = [
    { classId: "warden", factionId: "hold", id: "w1" },
    { classId: "warden", factionId: "hold", id: "w2" },
    { classId: "warden", factionId: "hold", id: "w3" },
    { classId: "hunter", factionId: "hold", id: "h1" },
    { classId: "villager", factionId: "hold", id: "v1" },
    { classId: "warden", factionId: "horde", id: "imp-warden" },
  ];

  test("selects every on-screen Hold unit of the clicked class", () => {
    expect(
      similarVisibleUnitIds(units, "w2", [
        "w1",
        "w2",
        "h1",
        "v1",
        "imp-warden",
      ]),
    ).toEqual(["w2", "w1"]);
  });

  test("leaves out same-class units that are off screen", () => {
    expect(similarVisibleUnitIds(units, "w1", ["w1"])).toEqual(["w1"]);
  });

  test("keeps the clicked unit even if projection missed it", () => {
    expect(similarVisibleUnitIds(units, "v1", [])).toEqual(["v1"]);
  });

  test("selects only the enemy that was double-clicked", () => {
    expect(
      similarVisibleUnitIds(units, "imp-warden", ["w1", "imp-warden"]),
    ).toEqual(["imp-warden"]);
  });

  test("selects nothing when the unit is gone", () => {
    expect(similarVisibleUnitIds(units, "missing", ["w1"])).toEqual([]);
  });
});

describe("selectionGroups", () => {
  const mixed = [
    { classId: "villager", factionId: "hold" as const, id: "v1" },
    { classId: "warden", factionId: "hold" as const, id: "w1" },
    { classId: "villager", factionId: "hold" as const, id: "v2" },
    { classId: "raider", factionId: "horde" as const, id: "r1" },
    { classId: "raider", factionId: "hold" as const, id: "r2" },
  ];

  test("groups by faction and class in selection order, Hold first", () => {
    const groups = selectionGroups(mixed, ["r1", "w1", "v1", "v2", "r2"]);
    expect(groups.map((group) => [group.key, group.unitIds])).toEqual([
      ["hold:warden", ["w1"]],
      ["hold:villager", ["v1", "v2"]],
      ["hold:raider", ["r2"]],
      ["horde:raider", ["r1"]],
    ]);
  });

  test("skips ids that are no longer on the map", () => {
    expect(selectionGroups(mixed, ["gone"])).toEqual([]);
  });
});
