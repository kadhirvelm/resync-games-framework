import { describe, expect, test } from "bun:test";
import type { SaveClimbPayload } from "@resync-game-framework/api";
import {
  type ClimbSyncOperation,
  createClimbSyncQueue,
} from "../climbSyncQueue";

/**
 * @param id - Climb id
 * @param floorIndex - Floor, to tell saves apart
 * @returns A save operation
 */
function save(id: string, floorIndex: number): ClimbSyncOperation {
  return {
    kind: "save",
    payload: { floorIndex, id } as SaveClimbPayload,
  };
}

/**
 * @param operation - Sent operation
 * @returns A short label for assertions
 */
function label(operation: ClimbSyncOperation): string {
  return operation.kind === "save"
    ? `save ${operation.payload.id}@${operation.payload.floorIndex}`
    : `delete ${operation.climbId}`;
}

describe("createClimbSyncQueue", () => {
  test("sends one at a time and coalesces waiting saves of a climb", async () => {
    const sent: string[] = [];
    let release: () => void = () => undefined;
    const queue = createClimbSyncQueue(
      async (operation) => {
        sent.push(label(operation));
        if (sent.length === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return undefined;
      },
      () => undefined,
    );

    queue.push(save("a", 0));
    queue.push(save("a", 1));
    queue.push(save("b", 0));
    queue.push(save("a", 2));
    release();
    await queue.settled();

    expect(sent).toEqual(["save a@0", "save b@0", "save a@2"]);
  });

  test("a delete replaces a waiting save and runs after the one in flight", async () => {
    const sent: string[] = [];
    let release: () => void = () => undefined;
    const queue = createClimbSyncQueue(
      async (operation) => {
        sent.push(label(operation));
        if (sent.length === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return undefined;
      },
      () => undefined,
    );

    queue.push(save("a", 0));
    queue.push(save("a", 1));
    queue.push({ climbId: "a", kind: "delete" });
    release();
    await queue.settled();

    expect(sent).toEqual(["save a@0", "delete a"]);
  });

  test("reports each result, including thrown errors", async () => {
    const results: (string | undefined)[] = [];
    const queue = createClimbSyncQueue(
      async (operation) => {
        if (operation.kind === "delete") {
          throw new Error("offline");
        }
        return "Too many climbs";
      },
      (error) => results.push(error),
    );

    queue.push(save("a", 0));
    queue.push({ climbId: "b", kind: "delete" });
    await queue.settled();

    expect(results).toEqual(["Too many climbs", "offline"]);
  });
});
