import { describe, expect, test } from "bun:test";
import type { OrderBuilding, OrderNode, OrderUnit } from "../selection";
import { ordersForRightClick } from "../selection";

const cache: OrderNode = {
  explorationCacheId: "bound-workers",
  id: "exploration-cache:bound-workers",
  x: 10,
  y: 10,
};

const villagers: OrderUnit[] = [
  {
    classId: "villager",
    factionId: "hold",
    id: "villager-1",
    x: 1,
    y: 1,
  },
  {
    classId: "cultivator",
    factionId: "hold",
    id: "captain",
    x: 1,
    y: 1,
  },
  {
    classId: "warden",
    factionId: "hold",
    id: "warden-1",
    x: 1,
    y: 1,
  },
];

const buildings: OrderBuilding[] = [];

/** Builds right-click input with the selected unit ids changed per case. */
function input(selectedIds: readonly string[]) {
  return {
    buildings,
    ground: { x: 10, y: 10 },
    nodes: [cache],
    selectedIds,
    targetBuildingId: null,
    targetUnitId: null,
    units: villagers,
  };
}

describe("exploration cache orders", () => {
  test("a villager can be sent to haul a cache", () => {
    expect(ordersForRightClick(input(["villager-1"]))).toEqual([
      {
        nodeId: cache.id,
        type: "assign_gather",
        unitIds: ["villager-1"],
      },
    ]);
  });

  test("a Qi cultivator can be sent to haul a cache", () => {
    expect(ordersForRightClick(input(["captain"]))).toEqual([
      { nodeId: cache.id, type: "assign_gather", unitIds: ["captain"] },
    ]);
  });

  test("a loaded Qi cultivator can deliver directly to storage", () => {
    const dropOff: OrderBuilding = {
      buildingType: "camp",
      factionId: "hold",
      id: "ashen-camp",
    };
    const loaded = villagers.map((unit) =>
      unit.id === "captain"
        ? { ...unit, carrying: { amount: 1, resource: "essence" as const } }
        : unit,
    );
    expect(
      ordersForRightClick({
        ...input(["captain"]),
        buildings: [dropOff],
        targetBuildingId: dropOff.id,
        units: loaded,
      }),
    ).toEqual([
      {
        buildingId: dropOff.id,
        type: "assign_build",
        unitIds: ["captain"],
      },
    ]);
  });

  test("non-carrier soldiers receive a move order instead", () => {
    expect(ordersForRightClick(input(["warden-1"]))).toEqual([
      { type: "order_move", unitIds: ["warden-1"], x: 10, y: 10 },
    ]);
  });

  test("mixed selections gather with carriers and move the other soldiers", () => {
    expect(
      ordersForRightClick(input(["villager-1", "captain", "warden-1"])),
    ).toEqual([
      {
        nodeId: cache.id,
        type: "assign_gather",
        unitIds: ["villager-1", "captain"],
      },
      { type: "order_move", unitIds: ["warden-1"], x: 10, y: 10 },
    ]);
  });
});
