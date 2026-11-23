import { expect, test } from "bun:test";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  type AshenGateSliceState,
  createAshenGateSim,
} from "../../ashenGateSlice";

test("a soldier's blocked formation slot does not deadlock its shift-queued leg", () => {
  const sim = createAshenGateSim({ seed: 7, waterways: false });
  const camp = sim
    .snapshot()
    .buildings.find((building) => building.buildingType === "camp");
  if (!camp) throw new Error("Missing Camp");
  const goal = { x: camp.x + 10, y: camp.y + 8 };
  sim.enqueue({
    type: "order_move",
    unitIds: ["ashen-captain"],
    x: camp.x,
    y: camp.y,
  });
  sim.step(1);
  sim.enqueue({
    queue: true,
    type: "order_move",
    unitIds: ["ashen-captain"],
    ...goal,
  });
  let reached = false;
  for (let tick = 0; tick < 1500; tick += 1) {
    sim.step(1);
    const captain = sim
      .snapshot()
      .units.find((unit) => unit.id === "ashen-captain");
    if (!captain) throw new Error("Missing captain");
    if (Math.hypot(captain.x - goal.x, captain.y - goal.y) < 1) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  const state = sim.snapshot().meta[
    ASHEN_GATE_SLICE_MODULE_ID
  ] as AshenGateSliceState;
  expect(state.waypoints?.["ashen-captain"]).toBeUndefined();
});
