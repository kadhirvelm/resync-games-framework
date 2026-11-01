import { describe, expect, test } from "bun:test";
import type { ThreeDPrototype } from "@towers-of-coreborn/api";
import {
  interactWithPrototype,
  movePrototypePlayer,
  parsePrototypeRun,
  startPrototypeRun,
} from "../prototypeRun";

const prototype: ThreeDPrototype = {
  createdAt: "",
  id: "test",
  name: "Test",
  objective: "Activate and return",
  prompt: "",
  slots: [
    {
      id: "beacon",
      kind: "prop",
      name: "Beacon",
      position: [4, 0, 0],
      prompt: "",
    },
  ],
};
describe("3D prototype rules", () => {
  test("requires beacon proximity and a return to the portal", () => {
    const initial = startPrototypeRun(prototype.id);
    expect(interactWithPrototype(initial, prototype)).toEqual(initial);
    const activated = interactWithPrototype({ ...initial, x: 4 }, prototype);
    expect(activated.activated).toEqual(["beacon"]);
    expect(activated.finished).toBe(false);
    const completed = interactWithPrototype({ ...activated, x: 0 }, prototype);
    expect(completed.finished).toBe(true);
    expect(movePrototypePlayer(completed, 1, 0, 0.1)).toEqual(completed);
  });
  test("normalizes diagonal movement, bounds frame time and clamps the arena", () => {
    const moved = movePrototypePlayer(
      startPrototypeRun(prototype.id),
      1,
      1,
      50,
    );
    expect(Math.hypot(moved.x, moved.z)).toBeCloseTo(0.4);
    expect(movePrototypePlayer({ ...moved, x: 7.5 }, 1, 0, 0.1).x).toBe(7.5);
  });
  test("rejects cross-world saves and strips stale collected ids", () => {
    expect(
      parsePrototypeRun({ ...startPrototypeRun("other"), x: 4 }, prototype).x,
    ).toBe(0);
    expect(
      parsePrototypeRun(
        {
          ...startPrototypeRun("test"),
          activated: ["beacon", "beacon", "deleted"],
        },
        prototype,
      ).activated,
    ).toEqual(["beacon"]);
  });
});
