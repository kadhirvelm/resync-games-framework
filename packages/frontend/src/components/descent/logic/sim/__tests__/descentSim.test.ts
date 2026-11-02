import { describe, expect, test } from "bun:test";
import { RESOURCE_IDS } from "../../types";
import { createDescentSim } from "../descentSim";
import { compileSimPipeline, type SimEvent, type SimModule } from "../modules";
import {
  captureError,
  runScript,
  SANDBOX_SCRIPT,
  sandboxModule,
} from "./fixtures";

describe("determinism", () => {
  test("same seed and commands give identical snapshots after N ticks", () => {
    const first = createDescentSim({ modules: [sandboxModule], seed: 1234 });
    const second = createDescentSim({ modules: [sandboxModule], seed: 1234 });

    runScript(first, SANDBOX_SCRIPT, 60);
    runScript(second, SANDBOX_SCRIPT, 60);

    expect(first.tick).toBe(60);
    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.serialize()).toBe(second.serialize());
    expect(first.snapshot().units).toHaveLength(3);
    expect(first.snapshot().resources.essence).toBeGreaterThan(0);
  });

  test("a different seed diverges", () => {
    const first = createDescentSim({ modules: [sandboxModule], seed: 1 });
    const second = createDescentSim({ modules: [sandboxModule], seed: 2 });

    runScript(first, SANDBOX_SCRIPT, 60);
    runScript(second, SANDBOX_SCRIPT, 60);

    expect(first.serialize()).not.toBe(second.serialize());
  });

  test("batching ticks does not change the result", () => {
    const stepped = createDescentSim({ modules: [sandboxModule], seed: 77 });
    const batched = createDescentSim({ modules: [sandboxModule], seed: 77 });
    runScript(stepped, [], 40);
    batched.step(40);

    expect(stepped.snapshot()).toEqual(batched.snapshot());
  });
});

describe("empty world", () => {
  test("starts at tick 0 with empty collections and zeroed resources", () => {
    const sim = createDescentSim({ seed: 9 });
    const snapshot = sim.snapshot();

    expect(snapshot.tick).toBe(0);
    expect(snapshot.layerId).toBeNull();
    expect(snapshot.units).toEqual([]);
    expect(snapshot.buildings).toEqual([]);
    expect(snapshot.meta).toEqual({});
    expect(Object.keys(snapshot.resources)).toEqual([...RESOURCE_IDS]);
    expect(
      Object.values(snapshot.resources).every((value) => value === 0),
    ).toBe(true);
    expect(sim.step(3)).toBe(3);
    expect(sim.tick).toBe(3);
  });
});

describe("pause and speed", () => {
  test("pause freezes ticks; commands queue and run after resume", () => {
    const sim = createDescentSim({ modules: [sandboxModule], seed: 5 });
    sim.step(2);
    sim.setPaused(true);
    const stamped = sim.enqueue({
      buildingType: "Ward Tower",
      type: "place_building",
      x: 1,
      y: 1,
    });

    expect(sim.step(10)).toBe(0);
    expect(sim.stepFrame()).toBe(0);
    expect(sim.tick).toBe(2);
    expect(sim.snapshot().buildings).toHaveLength(0);
    expect(stamped.tick).toBe(2);

    sim.setPaused(false);
    sim.step(1);
    expect(sim.snapshot().buildings).toHaveLength(1);
  });

  test("speed changes ticks per frame step, not tick length", () => {
    const normal = createDescentSim({ modules: [sandboxModule], seed: 11 });
    const fast = createDescentSim({ modules: [sandboxModule], seed: 11 });
    fast.setSpeed(2);

    for (let frame = 0; frame < 10; frame += 1) {
      normal.stepFrame();
      fast.stepFrame();
    }

    expect(normal.tick).toBe(10);
    expect(fast.tick).toBe(20);
    normal.step(10);
    expect({ ...normal.snapshot(), speed: 2 }).toEqual(fast.snapshot());
  });

  test("rejects speeds outside the allowed set", () => {
    const sim = createDescentSim({ seed: 1 });
    expect(captureError(() => sim.setSpeed(3)) instanceof RangeError).toBe(
      true,
    );
    expect(captureError(() => sim.step(-1)) instanceof RangeError).toBe(true);
  });

  test("a listener that pauses stops the current step at a tick boundary", () => {
    const sim = createDescentSim({ modules: [sandboxModule], seed: 3 });
    sim.onEvent((event) => {
      if (event.type === "layer_started") sim.setPaused(true);
    });
    sim.step(4);
    sim.enqueue({ type: "descend" });

    expect(sim.step(10)).toBe(1);
    expect(sim.tick).toBe(5);
    expect(sim.paused).toBe(true);
  });
});

describe("snapshot", () => {
  test("is frozen and cached until the sim changes", () => {
    const sim = createDescentSim({ modules: [sandboxModule], seed: 3 });
    sim.enqueue({
      buildingType: "Barracks",
      type: "place_building",
      x: 0,
      y: 0,
    });
    sim.step();
    const snapshot = sim.snapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.buildings[0])).toBe(true);
    expect(sim.snapshot()).toBe(snapshot);

    let notified = 0;
    sim.subscribe(() => {
      notified += 1;
    });
    sim.step();
    expect(notified).toBe(1);
    expect(sim.snapshot()).not.toBe(snapshot);
  });
});

describe("events", () => {
  test("a starting layer raises layer_started on the first step", () => {
    const sim = createDescentSim({ layerId: "ashen-gate", seed: 1 });
    const events: SimEvent[] = [];
    sim.onEvent((event) => events.push(event));
    sim.step();

    expect(events).toEqual([
      { layerId: "ashen-gate", tick: 0, type: "layer_started" },
    ]);
  });

  test("listeners cannot re-enter step", () => {
    const sim = createDescentSim({ layerId: "ashen-gate", seed: 1 });
    sim.onEvent(() => sim.step());
    expect(captureError(() => sim.step()).message).toBe(
      "step() cannot be called from a sim listener",
    );
  });
});

describe("module registration", () => {
  test("processors run by phase, then module order", () => {
    const order: string[] = [];
    const record = (
      id: string,
      phase: "combat" | "economy" | "waves",
    ): SimModule => ({
      id,
      processors: [{ id, phase, run: () => order.push(id) }],
    });
    const sim = createDescentSim({
      modules: [
        record("waves", "waves"),
        record("combat", "combat"),
        record("economy-a", "economy"),
        record("economy-b", "economy"),
      ],
      seed: 1,
    });
    sim.step();

    expect(order).toEqual(["economy-a", "economy-b", "combat", "waves"]);
  });

  test("rejects duplicate module ids and command owners", () => {
    const duplicateId = captureError(() =>
      compileSimPipeline([{ id: "a" }, { id: "a" }]),
    );
    const duplicateOwner = captureError(() =>
      compileSimPipeline([
        { commands: { descend: () => {} }, id: "a" },
        { commands: { descend: () => {} }, id: "b" },
      ]),
    );

    expect(duplicateId.message).toBe("Duplicate Descent sim module id: a");
    expect(duplicateOwner.message).toBe(
      'Command "descend" already has a handler; b cannot claim it',
    );
  });

  test("commands without a handler are consumed and ignored", () => {
    const sim = createDescentSim({ seed: 1 });
    sim.enqueue({ type: "recall_villagers" });
    sim.step();

    expect(JSON.parse(sim.serialize()).state.pendingCommands).toEqual([]);
  });
});
