import { describe, expect, it } from "bun:test";
import { shouldApplyGameRoomSnapshot } from "../roomRevision";

describe("shouldApplyGameRoomSnapshot", () => {
  const current = { id: "ABC234", revision: 7 };

  it("accepts initial rooms and snapshots from a different room", () => {
    expect(shouldApplyGameRoomSnapshot(null, current)).toBe(true);
    expect(
      shouldApplyGameRoomSnapshot(current, { id: "OTHER5", revision: 0 }),
    ).toBe(true);
  });

  it("accepts newer and duplicate revisions", () => {
    expect(
      shouldApplyGameRoomSnapshot(current, { id: current.id, revision: 8 }),
    ).toBe(true);
    expect(shouldApplyGameRoomSnapshot(current, current)).toBe(true);
  });

  it("rejects stale revisions only for the same room", () => {
    expect(
      shouldApplyGameRoomSnapshot(current, { id: current.id, revision: 6 }),
    ).toBe(false);
  });
});
