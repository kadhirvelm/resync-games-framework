import { describe, expect, test } from "bun:test";
import {
  type DescentUnitAcknowledgement,
  emitDescentUnitAcknowledgement,
  subscribeDescentUnitAcknowledgement,
} from "../descentCommandAck";

describe("Descent unit acknowledgement events", () => {
  test("publishes class and gesture without requiring an audio catalog", () => {
    const received: DescentUnitAcknowledgement[] = [];
    const unsubscribe = subscribeDescentUnitAcknowledgement((event) => {
      received.push(event);
    });
    emitDescentUnitAcknowledgement("villager", "select");
    emitDescentUnitAcknowledgement("warden", "command");
    unsubscribe();
    emitDescentUnitAcknowledgement("adept", "select");
    expect(received).toEqual([
      { classId: "villager", kind: "select" },
      { classId: "warden", kind: "command" },
    ]);
  });

  test("does nothing when no audio hook is subscribed", () => {
    expect(() =>
      emitDescentUnitAcknowledgement("hunter", "command"),
    ).not.toThrow();
  });
});
