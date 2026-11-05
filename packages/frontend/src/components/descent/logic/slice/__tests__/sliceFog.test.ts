import { describe, expect, test } from "bun:test";
import { buildShellModel } from "../../../views/shellModel";
import { createAshenGateSim } from "../../ashenGateSlice";
import { fogVisibilityAt, isFogOfWarState } from "../../fog";
import type { SimSnapshot } from "../../types";
import { FOG_OF_WAR_META_KEY, FOG_UPDATE_TICKS } from "../sliceFog";

/**
 * @param snapshot - Sim snapshot
 * @returns The Camp's position
 */
function campOf(snapshot: SimSnapshot): { x: number; y: number } {
  const camp = snapshot.buildings.find(
    (building) => building.buildingType === "camp",
  );
  if (!camp) throw new Error("no Camp");
  return camp;
}

describe("Ashen Gate fog of war", () => {
  test("a new run sees only around the Hold; the rest of the map is black", () => {
    const sim = createAshenGateSim({ seed: 7 });
    const start = sim.snapshot();
    const fog = start.meta[FOG_OF_WAR_META_KEY];
    if (!isFogOfWarState(fog)) throw new Error("no fog published");
    const camp = campOf(start);
    expect(fog.width).toBe(start.map.width);
    expect(fog.height).toBe(start.map.height);
    expect(fogVisibilityAt(fog, camp.x, camp.y)).toBe("visible");
    expect(
      fogVisibilityAt(fog, start.map.width - 2, start.map.height / 2),
    ).toBe("unseen");
    const unseen = [...fog.cells].filter((cell) => cell === "0").length;
    expect(unseen / fog.cells.length).toBeGreaterThan(0.9);
  });

  test("the shell only shows deposits the Hold has discovered", () => {
    const sim = createAshenGateSim({ seed: 7 });
    const model = buildShellModel(sim.snapshot());
    expect(model.fog).not.toBeNull();
    expect(model.nodes.length).toBeGreaterThan(0);
    expect(model.nodes.length).toBeLessThan(16);
    for (const node of model.nodes) {
      expect(fogVisibilityAt(model.fog, node.x, node.y)).not.toBe("unseen");
    }
    expect(model.units.every((unit) => unit.factionId === "hold")).toBe(true);
  });

  test("ground a scout leaves stays explored but is no longer in sight", () => {
    const sim = createAshenGateSim({ seed: 7 });
    const start = sim.snapshot();
    const camp = campOf(start);
    const target = { x: Math.min(start.map.width - 3, camp.x + 60), y: camp.y };
    const waypoint = { x: camp.x + 30, y: camp.y };
    expect(
      fogVisibilityAt(
        start.meta[FOG_OF_WAR_META_KEY] as never,
        waypoint.x,
        waypoint.y,
      ),
    ).toBe("unseen");
    sim.enqueue({ type: "order_move", unitIds: ["ashen-captain"], ...target });
    const passedWaypoint = (): boolean =>
      (sim.snapshot().units.find((unit) => unit.id === "ashen-captain")?.x ??
        0) >=
      waypoint.x + 20;
    for (let tick = 0; tick < 2_000 && !passedWaypoint(); tick += 1) {
      sim.step(1);
    }
    expect(passedWaypoint()).toBe(true);
    sim.step(FOG_UPDATE_TICKS);
    const fog = sim.snapshot().meta[FOG_OF_WAR_META_KEY] as never;
    expect(fogVisibilityAt(fog, waypoint.x, waypoint.y)).toBe("explored");
  });
});
