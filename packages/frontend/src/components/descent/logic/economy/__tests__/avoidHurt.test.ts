import { describe, expect, test } from "bun:test";
import { activeVentVolumes, isInsideVolume } from "../../layers/hazards";
import { createDescentSim, type DescentSim } from "../../sim";
import type { SimModule } from "../../sim/modules";
import { seedEconomyWorld } from "../economy";
import type { EconomyUnit } from "../model";
import { createEconomyModule } from "../module";
import { economyHost } from "../records";
import { orderVillagersMove } from "../villagers";

const scenario: SimModule = {
  commands: {
    order_move(command, context) {
      orderVillagersMove(economyHost(context.world), command.unitIds, command);
    },
  },
  id: "avoid-hurt-scenario",
  init(world) {
    seedEconomyWorld(world, {
      layerId: "ashen_gate",
      nodes: [],
      units: [{ id: "v1", x: 22, y: 10 }],
      veins: [],
    });
  },
};

/**
 * @returns A sim whose one villager starts south of an Ashen Gate vent
 */
function sim(): DescentSim {
  return createDescentSim({
    layerId: "ashen_gate",
    map: { height: 48, width: 48 },
    modules: [createEconomyModule({ manualVillagers: true }), scenario],
    seed: 1,
  });
}

/**
 * @param world - Sim
 * @returns The villager
 */
function villager(world: DescentSim): EconomyUnit {
  const unit = world.snapshot().units.find((entry) => entry.id === "v1");
  if (!unit) throw new Error("missing villager");
  return unit as EconomyUnit;
}

describe("villagers walk around ember vents", () => {
  test("a move through a vent goes around it and never stands in the burn", () => {
    const world = sim();
    world.enqueue({ type: "order_move", unitIds: ["v1"], x: 22, y: 18 });
    const seen: { x: number; y: number }[] = [];
    for (let step = 0; step < 40; step += 1) {
      world.step(1);
      const unit = villager(world);
      seen.push({ x: unit.x, y: unit.y });
      if (unit.x === 22 && unit.y === 18) break;
    }
    for (const point of seen) {
      const burning = activeVentVolumes("ashen_gate").some((vent) =>
        isInsideVolume(vent, point.x, point.y),
      );
      expect(burning).toBe(false);
    }
    expect(seen.at(-1)).toEqual({ x: 22, y: 18 });
  });
});
