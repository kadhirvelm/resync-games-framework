import { describe, expect, test } from "bun:test";
import { buildShellModel } from "../../../views/shellModel";
import { createAshenGateSim } from "../../ashenGateSlice";
import type { DescentSim } from "../../sim/descentSim";

/**
 * Tops up the stockpile through a save round-trip, so the upgrade is
 * affordable without simulating a whole economy.
 * @param sim - Sim to refill
 */
function fillStockpile(sim: DescentSim): void {
  const save = JSON.parse(sim.serialize()) as {
    state?: { resources?: Record<string, number> };
  };
  const resources = save.state?.resources;
  if (resources === undefined) throw new Error("save has no resources");
  resources.stone = 500;
  resources.wood = 500;
  sim.load(JSON.stringify(save));
}

describe("Hold upgrade progress", () => {
  test("a started upgrade publishes its progress until the tier changes", () => {
    const sim = createAshenGateSim({ seed: 7 });
    fillStockpile(sim);
    expect(buildShellModel(sim.snapshot()).holdUpgrade?.inProgress).toBeNull();

    sim.enqueue({ type: "upgrade_hold" });
    sim.step(1);
    const started = buildShellModel(sim.snapshot()).holdUpgrade;
    expect(started?.targetTier).toBe("Stronghold");
    expect(started?.allowed).toBe(false);
    expect(started?.inProgress?.progress).toBeGreaterThanOrEqual(0);
    expect(started?.inProgress?.secondsLeft).toBeGreaterThan(0);

    sim.step(40);
    const later = buildShellModel(sim.snapshot()).holdUpgrade?.inProgress;
    expect(later?.progress).toBeGreaterThan(started?.inProgress?.progress ?? 1);

    for (let tick = 0; tick < 2_000; tick += 1) {
      if (buildShellModel(sim.snapshot()).holdUpgrade?.targetTier === "Citadel")
        break;
      sim.step(1);
    }
    const done = buildShellModel(sim.snapshot()).holdUpgrade;
    expect(done?.currentTier).toBe("Stronghold");
    expect(done?.inProgress).toBeNull();
  });
});
