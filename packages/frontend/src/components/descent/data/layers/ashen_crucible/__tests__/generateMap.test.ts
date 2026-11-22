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

      // Each player gets their own Camp, Captain Warden, and 3 Villagers.
      expect(map.buildings).toHaveLength(playerCount);
      expect(map.units).toHaveLength(playerCount * 4);
      for (const player of players) {
        const ownedCamps = map.buildings.filter(
          (building) =>
            building.buildingType === "camp" && building.ownerId === player.id,
        );
        expect(ownedCamps).toHaveLength(1);
        const ownedUnits = map.units.filter(
          (unit) => unit.ownerId === player.id,
        );
        expect(ownedUnits).toHaveLength(4);
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
