/** Number-row slots available to RTS control groups. */
export type ControlGroupSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Maximum delay between two recalls that center the camera on the group. */
export const CONTROL_GROUP_DOUBLE_TAP_MS = 400;

/** In-memory control groups and the recall timing for one game session. */
export interface ControlGroupsState {
  readonly groups: Readonly<
    Partial<Record<ControlGroupSlot, readonly string[]>>
  >;
  readonly lastRecall: {
    readonly at: number;
    readonly slot: ControlGroupSlot;
  } | null;
}

/** Result of pressing a control group's number key. */
export interface ControlGroupRecall {
  /** Whether this recall should also center the camera on the group. */
  readonly center: boolean;
  /** Ids to select, or null when the slot has no assigned units. */
  readonly selectionIds: readonly string[] | null;
  /** Next immutable session state. */
  readonly state: ControlGroupsState;
}

/**
 * Creates empty control-group state for a new game session.
 * @returns Session state with no assignments or recall history
 */
export function createControlGroupsState(): ControlGroupsState {
  return { groups: {}, lastRecall: null };
}

/**
 * Removes duplicate ids without changing their selection order.
 * @param ids - Selected unit ids
 * @returns A fresh id list containing each id once
 */
function uniqueUnitIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Replaces one control group with the current unit selection.
 * @param state - Current session state
 * @param slot - Number-row slot to assign
 * @param selectionIds - Currently selected unit ids
 * @returns Next state; an empty selection clears the slot
 */
export function saveControlGroup(
  state: ControlGroupsState,
  slot: ControlGroupSlot,
  selectionIds: readonly string[],
): ControlGroupsState {
  return {
    groups: { ...state.groups, [slot]: uniqueUnitIds(selectionIds) },
    lastRecall: null,
  };
}

/**
 * Adds the current unit selection to an existing control group.
 * @param state - Current session state
 * @param slot - Number-row slot to extend
 * @param selectionIds - Currently selected unit ids
 * @returns Next state with duplicates removed in stable order
 */
export function addToControlGroup(
  state: ControlGroupsState,
  slot: ControlGroupSlot,
  selectionIds: readonly string[],
): ControlGroupsState {
  const existing = state.groups[slot] ?? [];
  return saveControlGroup(state, slot, [...existing, ...selectionIds]);
}

/**
 * Recalls a control group and recognizes a second tap of the same number.
 * Empty slots leave the selection alone and interrupt any double-tap sequence.
 * @param state - Current session state
 * @param slot - Number-row slot to recall
 * @param now - Current timestamp in milliseconds
 * @returns Selection ids, centering intent, and next immutable state
 */
export function recallControlGroup(
  state: ControlGroupsState,
  slot: ControlGroupSlot,
  now: number,
): ControlGroupRecall {
  const selectionIds = state.groups[slot];
  if (selectionIds === undefined || selectionIds.length === 0) {
    return {
      center: false,
      selectionIds: null,
      state: { ...state, lastRecall: null },
    };
  }
  const previous = state.lastRecall;
  const elapsed =
    previous === null ? Number.POSITIVE_INFINITY : now - previous.at;
  const center =
    previous?.slot === slot &&
    elapsed >= 0 &&
    elapsed <= CONTROL_GROUP_DOUBLE_TAP_MS;
  return {
    center,
    selectionIds,
    state: { ...state, lastRecall: { at: now, slot } },
  };
}
