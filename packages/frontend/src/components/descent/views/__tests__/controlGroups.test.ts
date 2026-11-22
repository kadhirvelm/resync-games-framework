import { describe, expect, test } from "bun:test";
import {
  addToControlGroup,
  CONTROL_GROUP_DOUBLE_TAP_MS,
  createControlGroupsState,
  recallControlGroup,
  saveControlGroup,
} from "../controlGroups";

describe("control group assignment", () => {
  test("starts empty and saves deduplicated selection ids immutably", () => {
    const initial = createControlGroupsState();
    const saved = saveControlGroup(initial, 1, [
      "warden",
      "villager",
      "warden",
    ]);
    expect(initial).toEqual({ groups: {}, lastRecall: null });
    expect(saved.groups[1]).toEqual(["warden", "villager"]);
    expect(saved.lastRecall).toBeNull();
  });

  test("replaces a group on save and clears it with an empty selection", () => {
    const saved = saveControlGroup(createControlGroupsState(), 2, ["old"]);
    const replaced = saveControlGroup(saved, 2, ["new"]);
    expect(replaced.groups[2]).toEqual(["new"]);
    expect(saved.groups[2]).toEqual(["old"]);
    const cleared = saveControlGroup(replaced, 2, []);
    expect(cleared.groups[2]).toEqual([]);
  });

  test("adds new selection ids in stable order without duplicates", () => {
    const saved = saveControlGroup(createControlGroupsState(), 3, ["a", "b"]);
    const added = addToControlGroup(saved, 3, ["b", "c", "c", "a"]);
    expect(added.groups[3]).toEqual(["a", "b", "c"]);
    expect(saved.groups[3]).toEqual(["a", "b"]);
    expect(added).not.toBe(saved);
  });
});

describe("control group recall", () => {
  test("recalls a saved selection without centering on the first tap", () => {
    const saved = saveControlGroup(createControlGroupsState(), 1, ["a", "b"]);
    const recalled = recallControlGroup(saved, 1, 1_000);
    expect(recalled.selectionIds).toEqual(["a", "b"]);
    expect(recalled.center).toBe(false);
    expect(recalled.state.lastRecall).toEqual({ at: 1_000, slot: 1 });
    expect(saved.lastRecall).toBeNull();
  });

  test("centers on a second tap at or inside 400ms", () => {
    const saved = saveControlGroup(createControlGroupsState(), 1, ["a"]);
    const first = recallControlGroup(saved, 1, 1_000);
    const second = recallControlGroup(
      first.state,
      1,
      1_000 + CONTROL_GROUP_DOUBLE_TAP_MS,
    );
    expect(second.center).toBe(true);
    expect(second.selectionIds).toEqual(["a"]);
  });

  test("does not center after the double-tap window or a backwards clock step", () => {
    const saved = saveControlGroup(createControlGroupsState(), 1, ["a"]);
    const first = recallControlGroup(saved, 1, 1_000);
    expect(
      recallControlGroup(
        first.state,
        1,
        1_000 + CONTROL_GROUP_DOUBLE_TAP_MS + 1,
      ).center,
    ).toBe(false);
    expect(recallControlGroup(first.state, 1, 999).center).toBe(false);
  });

  test("switches double-tap tracking when another group is recalled", () => {
    let state = saveControlGroup(createControlGroupsState(), 1, ["a"]);
    state = saveControlGroup(state, 2, ["b"]);
    const first = recallControlGroup(state, 1, 100);
    const other = recallControlGroup(first.state, 2, 150);
    const second = recallControlGroup(other.state, 1, 200);
    expect(other.center).toBe(false);
    expect(second.center).toBe(false);
    expect(second.selectionIds).toEqual(["a"]);
  });

  test("leaves selection unchanged for empty slots and interrupts double taps", () => {
    const saved = saveControlGroup(createControlGroupsState(), 1, ["a"]);
    const first = recallControlGroup(saved, 1, 100);
    const empty = recallControlGroup(first.state, 2, 150);
    expect(empty.selectionIds).toBeNull();
    expect(empty.center).toBe(false);
    expect(empty.state.lastRecall).toBeNull();
    expect(recallControlGroup(empty.state, 1, 200).center).toBe(false);
  });

  test("saving or adding resets an earlier recall tap", () => {
    const saved = saveControlGroup(createControlGroupsState(), 1, ["a"]);
    const first = recallControlGroup(saved, 1, 100);
    const reassigned = saveControlGroup(first.state, 1, ["a"]);
    expect(recallControlGroup(reassigned, 1, 150).center).toBe(false);
    const tappedAgain = recallControlGroup(first.state, 1, 150);
    const extended = addToControlGroup(tappedAgain.state, 1, ["b"]);
    expect(recallControlGroup(extended, 1, 200).center).toBe(false);
  });
});
