import { describe, expect, test } from "bun:test";
import { createDescentSim } from "../descentSim";
import { createSimRng, normalizeSeed } from "../rng";
import {
  computeDueSteps,
  type FrameScheduler,
  startSimDriver,
} from "../simDriver";
import { captureError } from "./fixtures";

describe("seeded rng", () => {
  test("repeats for a seed and resumes from a saved cursor", () => {
    const first = createSimRng({ rngState: 77 });
    const second = createSimRng({ rngState: 77 });
    const firstValues = Array.from({ length: 5 }, () => first.next());
    expect(Array.from({ length: 5 }, () => second.next())).toEqual(firstValues);

    const holder = { rngState: 77 };
    const live = createSimRng(holder);
    live.next();
    live.next();
    const resumed = createSimRng({ rngState: holder.rngState });
    expect(resumed.next()).toBe(firstValues[2] as number);
  });

  test("int and pick stay in range", () => {
    const rng = createSimRng({ rngState: 5 });
    for (let index = 0; index < 200; index += 1) {
      const value = rng.int(-2, 2);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
      expect(["a", "b"]).toContain(rng.pick(["a", "b"]));
    }
  });

  test("normalizes seeds to uint32", () => {
    expect(normalizeSeed(-1)).toBe(0xffffffff);
    expect(normalizeSeed(12.9)).toBe(12);
    expect(
      captureError(() => normalizeSeed(Number.NaN)) instanceof RangeError,
    ).toBe(true);
  });
});

describe("real-time driver", () => {
  test("computeDueSteps keeps the remainder and drops stalls", () => {
    expect(computeDueSteps(0, 120, 50, 5)).toEqual({
      accumulatorMs: 20,
      steps: 2,
    });
    expect(computeDueSteps(20, 30, 50, 5)).toEqual({
      accumulatorMs: 0,
      steps: 1,
    });
    expect(computeDueSteps(0, 10_000, 50, 5)).toEqual({
      accumulatorMs: 0,
      steps: 5,
    });
    expect(computeDueSteps(10, -5, 50, 5)).toEqual({
      accumulatorMs: 10,
      steps: 0,
    });
  });

  test("advances speed × frame steps and stops on pause", () => {
    const callbacks: ((timeMs: number) => void)[] = [];
    const scheduler: FrameScheduler = {
      cancel: () => {},
      request: (callback) => callbacks.push(callback),
    };
    const sim = createDescentSim({ seed: 1 });
    sim.setSpeed(2);
    const stop = startSimDriver(sim, { scheduler, stepMs: 50 });
    const runFrame = (timeMs: number) =>
      (callbacks.at(-1) as (t: number) => void)(timeMs);

    runFrame(0);
    runFrame(100);
    expect(sim.tick).toBe(4);

    sim.setPaused(true);
    runFrame(400);
    expect(sim.tick).toBe(4);

    sim.setPaused(false);
    runFrame(450);
    expect(sim.tick).toBe(6);

    stop();
    const pending = callbacks.length;
    runFrame(1000);
    expect(sim.tick).toBe(6);
    expect(callbacks.length).toBe(pending);
  });

  test("resets frame clock on visibilitychange to avoid tab-return tick burst", () => {
    const listeners = new Map<string, Set<() => void>>();
    const mockDoc = {
      addEventListener: (event: string, fn: () => void) => {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(fn);
      },
      hidden: false,
      removeEventListener: (event: string, fn: () => void) => {
        listeners.get(event)?.delete(fn);
      },
    };
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: mockDoc,
      writable: true,
    });
    try {
      const callbacks: ((timeMs: number) => void)[] = [];
      const scheduler: FrameScheduler = {
        cancel: () => {},
        request: (callback) => callbacks.push(callback),
      };
      const sim = createDescentSim({ seed: 1 });
      sim.setSpeed(2);
      const stop = startSimDriver(sim, { scheduler, stepMs: 50 });
      const runFrame = (timeMs: number) =>
        (callbacks.at(-1) as (t: number) => void)(timeMs);

      runFrame(0);
      runFrame(50);
      expect(sim.tick).toBe(2);

      // Simulate tab hidden for 60 seconds, then visible again.
      mockDoc.hidden = true;
      for (const fn of listeners.get("visibilitychange") ?? []) fn();
      mockDoc.hidden = false;
      for (const fn of listeners.get("visibilitychange") ?? []) fn();

      // Next rAF arrives 60_000ms later; should re-anchor without bursting.
      runFrame(60_050);
      expect(sim.tick).toBe(2);

      // Following normal frame advances normally.
      runFrame(60_100);
      expect(sim.tick).toBe(4);

      stop();
      expect(listeners.get("visibilitychange")?.size ?? 0).toBe(0);
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
        writable: true,
      });
    }
  });
});
