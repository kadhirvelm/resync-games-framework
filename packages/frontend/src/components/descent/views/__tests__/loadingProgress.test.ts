import { describe, expect, test } from "bun:test";
import {
  createLoadingTracker,
  type LoadingProgress,
  loadingFraction,
  settleWithin,
} from "../loadingProgress";

/**
 * A promise with its settle functions exposed.
 * @returns The promise and its resolve and reject functions
 */
function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe("createLoadingTracker", () => {
  test("counts starts, finishes, and failures", async () => {
    const seen: LoadingProgress[] = [];
    const tracker = createLoadingTracker((progress) => seen.push(progress));
    const ward = deferred();
    const lava = deferred();

    void tracker.track("Ward model", ward.promise);
    void tracker.track("Lava painting", lava.promise).catch(() => undefined);
    expect(tracker.progress()).toEqual({
      completed: 0,
      current: "Ward model",
      failed: 0,
      total: 2,
    });

    ward.resolve();
    await ward.promise;
    expect(tracker.progress().current).toBe("Lava painting");

    lava.reject(new Error("404"));
    await lava.promise.catch(() => undefined);
    expect(tracker.progress()).toEqual({
      completed: 2,
      current: null,
      failed: 1,
      total: 2,
    });
    expect(seen).toHaveLength(4);
  });

  test("returns the work's own result", async () => {
    const tracker = createLoadingTracker(() => {});
    expect(await tracker.track("Manifest", Promise.resolve(7))).toBe(7);
  });
});

describe("loadingFraction", () => {
  test("is zero before work starts and capped at one", () => {
    expect(
      loadingFraction({ completed: 0, current: null, failed: 0, total: 0 }),
    ).toBe(0);
    expect(
      loadingFraction({ completed: 3, current: "x", failed: 0, total: 4 }),
    ).toBe(0.75);
  });
});

describe("settleWithin", () => {
  test("reports whether work beat the deadline", async () => {
    expect(await settleWithin(Promise.resolve(), 50)).toBe(true);
    expect(await settleWithin(Promise.reject(new Error("x")), 50)).toBe(true);
    expect(await settleWithin(new Promise(() => {}), 5)).toBe(false);
  });
});
