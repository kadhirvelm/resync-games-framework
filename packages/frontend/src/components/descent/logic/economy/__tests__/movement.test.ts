import { expect, test } from "bun:test";
import { createDescentSim } from "../../sim";
import { seedEconomyWorld } from "../economy";
import { createEconomyModule } from "../module";
import { economyHost } from "../records";
import { orderVillagersMove } from "../villagers";

test("a villager takes cardinal steps around blocked corners, including its final step", () => {
  const sim = createDescentSim({
    layerId: "ashen_gate",
    map: { height: 16, width: 16 },
    modules: [
      createEconomyModule({ manualVillagers: true }),
      {
        commands: {
          /** Forwards the move intent to the economy's normal order handler. */
          order_move(command, context) {
            orderVillagersMove(
              economyHost(context.world),
              command.unitIds,
              command,
            );
          },
        },
        id: "corner-movement-regression",
        /** Seeds an open target diagonally across two touching wall cells. */
        init(world) {
          seedEconomyWorld(world, {
            buildings: [
              { buildingType: "wall", completed: true, id: "east", x: 6, y: 5 },
              {
                buildingType: "wall",
                completed: true,
                id: "south",
                x: 5,
                y: 6,
              },
            ],
            layerId: "ashen_gate",
            nodes: [],
            units: [{ id: "walker", x: 5, y: 5 }],
            veins: [],
          });
        },
      },
    ],
    seed: 1,
  });
  sim.enqueue({ type: "order_move", unitIds: ["walker"], x: 6, y: 6 });
  let previous = { x: 5, y: 5 };
  let traveled = 0;
  for (let tick = 0; tick < 100; tick += 1) {
    sim.step(1);
    const unit = sim.snapshot().units.find((entry) => entry.id === "walker");
    expect(unit).toBeDefined();
    if (!unit) break;
    const step = Math.abs(unit.x - previous.x) + Math.abs(unit.y - previous.y);
    expect(step).toBeLessThanOrEqual(1);
    traveled += step;
    previous = { x: unit.x, y: unit.y };
    if (unit.x === 6 && unit.y === 6) break;
  }
  expect(previous).toEqual({ x: 6, y: 6 });
  expect(traveled).toBe(6);
});
