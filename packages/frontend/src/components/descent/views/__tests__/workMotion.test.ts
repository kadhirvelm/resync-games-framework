import { describe, expect, test } from "bun:test";
import {
  proceduralWorkPose,
  type VillagerWorkPose,
  type VillagerWorkTask,
  villagerWorkPose,
  villagerWorkTask,
} from "../motion";

const WORK_TASKS: readonly VillagerWorkTask[] = [
  "wood",
  "stone",
  "gold",
  "food",
  "build",
];

/** Compares every numeric channel in two poses. */
function expectPoseClose(
  actual: VillagerWorkPose,
  expected: VillagerWorkPose,
): void {
  for (const key of Object.keys(actual) as (keyof VillagerWorkPose)[]) {
    expect(actual[key]).toBeCloseTo(expected[key], 10);
  }
}

describe("villager procedural work motion", () => {
  test("maps published activities to the requested work styles", () => {
    expect(villagerWorkTask("Gathering Wood")).toBe("wood");
    expect(villagerWorkTask("Gathering Stone")).toBe("stone");
    expect(villagerWorkTask("Gathering Iron")).toBe("stone");
    expect(villagerWorkTask("Gathering Coin")).toBe("gold");
    expect(villagerWorkTask("Gathering Gold")).toBe("gold");
    expect(villagerWorkTask("Gathering Food")).toBe("food");
    expect(villagerWorkTask("Harvesting the Spirit Herb Garden")).toBe("food");
    expect(villagerWorkTask("Tending the Farm")).toBe("food");
    expect(villagerWorkTask("Building Barracks")).toBe("build");
    expect(villagerWorkTask("Repairing Barracks")).toBe("build");
    expect(villagerWorkTask("Working the Well")).toBe("build");
    expect(villagerWorkTask("Idle")).toBeNull();
    expect(villagerWorkTask()).toBeNull();
  });

  test("repeats every task on a one-second rhythm with finite angles", () => {
    for (const task of WORK_TASKS) {
      const pose = villagerWorkPose(125, task);
      expectPoseClose(villagerWorkPose(1_125, task), pose);
      expectPoseClose(villagerWorkPose(-875, task), pose);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
    }
  });

  test("winds up, strikes, and recovers instead of playing a static pose", () => {
    const rest = villagerWorkPose(0, "wood");
    const raised = villagerWorkPose(450, "wood");
    const impact = villagerWorkPose(620, "wood");

    expect(rest.rightArmPitch).toBeCloseTo(0);
    expect(raised.rightArmPitch).toBeLessThan(-1);
    expect(impact.rightArmPitch).toBeGreaterThan(1);
    expect(impact.torsoPitch).toBeGreaterThan(raised.torsoPitch);
    expect(impact.bob).toBeLessThan(rest.bob);
    expectPoseClose(villagerWorkPose(1_000, "wood"), rest);
  });

  test("uses distinct two-handed, hammering, and harvesting silhouettes", () => {
    const raisedWood = villagerWorkPose(450, "wood");
    const raisedHammer = villagerWorkPose(450, "build");
    const harvest = villagerWorkPose(250, "food");

    expect(Math.abs(raisedWood.leftArmPitch)).toBeGreaterThan(0.7);
    expect(Math.abs(raisedHammer.rightArmPitch)).toBeLessThan(
      Math.abs(raisedWood.rightArmPitch),
    );
    expect(raisedHammer.leftArmPitch).toBeLessThan(0);
    expect(harvest.leftArmPitch).toBeGreaterThan(harvest.rightArmPitch);
    expect(harvest.torsoPitch).toBeGreaterThan(0.17);
  });

  test("supports stable phase offsets without changing the task rhythm", () => {
    const phase = Math.PI / 2;
    expectPoseClose(
      villagerWorkPose(200, "stone", phase),
      villagerWorkPose(450, "stone"),
    );
    expectPoseClose(
      villagerWorkPose(200, "stone", phase),
      villagerWorkPose(1_200, "stone", phase),
    );
  });

  test("only replaces idle for stationary working villagers without work clips", () => {
    const working = {
      activity: "Gathering Wood",
      hasWorkClip: false,
      locomoting: false,
      role: "villager",
      timeMs: 620,
    };

    expect(proceduralWorkPose(working)).not.toBeNull();
    expect(proceduralWorkPose({ ...working, hasWorkClip: true })).toBeNull();
    expect(proceduralWorkPose({ ...working, locomoting: true })).toBeNull();
    expect(proceduralWorkPose({ ...working, role: "warden" })).toBeNull();
    expect(proceduralWorkPose({ ...working, activity: "Idle" })).toBeNull();
  });
});
