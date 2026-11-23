import { describe, expect, it } from "bun:test";
import {
  ASHEN_CRUCIBLE_MAP_SIZE,
  type AshenCruciblePlayer,
  generateAshenCrucibleMap,
  validateAshenCrucibleMap,
} from "..";

function makePlayers(count: number): AshenCruciblePlayer[] {
  const colors = ["#f2c14e", "#4db8ff", "#4be38a", "#c678ff"];
  return Array.from({ length: count }, (_, index) => ({
    color: colors[index] ?? "#f2c14e",
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    slotIndex: index,
  }));
}

describe("generateAshenCrucibleMap", () => {
  it("generates valid, reachable co-op layouts for 1 to 4 players", () => {
    for (const playerCount of [1, 2, 3, 4]) {
      const players = makePlayers(playerCount);
      const map = generateAshenCrucibleMap(42 + playerCount, players);
      expect(map.width).toBe(ASHEN_CRUCIBLE_MAP_SIZE.width);
      expect(map.height).toBe(ASHEN_CRUCIBLE_MAP_SIZE.height);
      expect(validateAshenCrucibleMap(map)).toEqual([]);

      // Each player gets their own Camp, Cultivator, Rider, and 3 Villagers.
      expect(map.buildings).toHaveLength(playerCount);
      expect(map.units).toHaveLength(playerCount * 5);
      for (const player of players) {
        const ownedCamps = map.buildings.filter(
          (building) =>
            building.buildingType === "camp" && building.ownerId === player.id,
        );
        expect(ownedCamps).toHaveLength(1);
        const ownedUnits = map.units.filter(
          (unit) => unit.ownerId === player.id,
        );
        expect(ownedUnits).toHaveLength(5);
        expect(
          ownedUnits.filter((unit) => unit.classId === "rider"),
        ).toHaveLength(1);
        expect(
          ownedUnits.filter((unit) => unit.classId === "cultivator"),
        ).toHaveLength(1);
      }
    }
  });

  it("gives every Camp three accessible nearby wood patches", () => {
    const cases = [1, 4].flatMap((playerCount) =>
      [1, 8, 1337].map((seed) => ({ playerCount, seed })),
    );
    for (const { playerCount, seed } of cases) {
      const players = makePlayers(playerCount);
      const map = generateAshenCrucibleMap(seed, players);
      expect(validateAshenCrucibleMap(map)).toEqual([]);
      for (const player of players) {
        const camp = map.buildings.find((entry) => entry.ownerId === player.id);
        if (!camp) throw new Error("Missing player Camp");
        const wood = map.nodes.filter((node) =>
          node.id.startsWith(`crucible-p${player.slotIndex + 1}-wood`),
        );
        expect(wood).toHaveLength(3);
        expect(wood.reduce((total, node) => total + node.remaining, 0)).toBe(
          780,
        );
        for (const node of wood) {
          expect(node.resourceId).toBe("wood");
          expect(Math.hypot(node.x - camp.x, node.y - camp.y)).toBeLessThan(20);
        }
      }
    }
  });

  it("reproduces the exact same map from the same seed and roster", () => {
    const players = makePlayers(4);
    const first = generateAshenCrucibleMap(1337, players);
    const second = generateAshenCrucibleMap(1337, players);
    expect(second).toEqual(first);
  });
});
