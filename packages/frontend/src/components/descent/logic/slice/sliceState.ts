import type {
  CombatCommand,
  CombatUnit,
  PendingProjectile,
} from "../combat/types";
import type { CultivationSystemState } from "../cultivation/types";
import type { SimWorldState } from "../sim/world";
import type { ClassId, ResourceStockpile } from "../types";
import { isWaveClockState } from "../waves/clock";
import type { WaveClockState } from "../waves/types";

/** Stable meta key for the Layer 1 integration state. */
export const ASHEN_GATE_SLICE_MODULE_ID = "ashenGateSlice";

/** Sim ticks per economy step: the Hold's economy ticks twice a second. */
export const ECONOMY_STEP_TICKS = 10;

/** Saved-state version. Older saves start a new run instead of loading. */
export const SLICE_STATE_VERSION = 2;

/** How long a notice stays on the published list, in ticks. */
export const NOTICE_LIFETIME_TICKS = 100;

/** How long a visual effect stays on the published list, in ticks. */
export const FX_LIFETIME_TICKS = 16;

/** Tone a notice is shown with. */
export type NoticeTone = "bad" | "good" | "info" | "warn";

/** A message for the toast list. `id` lets the view show each one once. */
export interface SliceNotice {
  id: number;
  text: string;
  tick: number;
  tone: NoticeTone;
}

/** A short-lived visual cue for the renderer. Never read by rules. */
export type SliceFx =
  | {
      from: { x: number; y: number };
      id: number;
      kind: "melee" | "projectile" | "heal";
      tick: number;
      to: { x: number; y: number };
    }
  | {
      amount: number;
      critical: boolean;
      id: number;
      kind: "damage";
      tick: number;
      x: number;
      y: number;
    }
  | {
      id: number;
      kind: "death" | "ascend" | "spawn" | "collapse";
      tick: number;
      x: number;
      y: number;
    };

/** One Barracks or Camp training order, queued or in progress. */
export interface TrainingJob {
  buildingId: string;
  classId: ClassId;
  count: number;
  id: string;
  remainingTicks: number;
  reservedPop: number;
  totalTicks: number;
  /** What the order cost, refunded in full when it is cancelled. */
  paidCost?: Partial<ResourceStockpile>;
}

/** Where a training building sends new units, optionally onto a node. */
export interface TrainingRallyPoint {
  nodeId?: string;
  x: number;
  y: number;
}

/** JSON-safe integration state stored with the sim save. */
export interface AshenGateSliceState {
  bossIntroShown: boolean;
  combat: {
    /** Per-body combat records: cooldowns, statuses, and orders survive ticks. */
    bodies: Record<string, CombatUnit>;
    /** Player orders waiting for the combat phase of this tick. */
    pendingOrders: CombatCommand[];
    projectiles: PendingProjectile[];
    tick: number;
  };
  cultivation: CultivationSystemState;
  fx: SliceFx[];
  /** Breakthrough injuries, in seconds left. */
  injuries: Record<string, number>;
  /** Tick each Hold unit last took damage; regen waits after a hit. */
  lastHitTick: Record<string, number>;
  nextFxId: number;
  nextNoticeId: number;
  notices: SliceNotice[];
  outcome: "defeat" | "playing" | "victory";
  /**
   * Custom destinations for units leaving a Camp or Barracks. A rally on a
   * resource node names it, and trained villagers gather there.
   */
  rallyPoints?: Record<string, TrainingRallyPoint>;
  stats: { kills: number; lost: number };
  training: TrainingJob[];
  version: typeof SLICE_STATE_VERSION;
}

/**
 * Creates the integration state for a brand-new run.
 * @returns Empty combat, cultivation, and notice state
 */
export function createSliceState(): AshenGateSliceState {
  return {
    bossIntroShown: false,
    combat: { bodies: {}, pendingOrders: [], projectiles: [], tick: 0 },
    cultivation: { groundTreasures: [], inventoryTreasures: [], units: [] },
    fx: [],
    injuries: {},
    lastHitTick: {},
    nextFxId: 1,
    nextNoticeId: 1,
    notices: [],
    outcome: "playing",
    rallyPoints: {},
    stats: { kills: 0, lost: 0 },
    training: [],
    version: SLICE_STATE_VERSION,
  };
}

/**
 * Narrows scenario meta loaded from a save.
 * @param value - Candidate meta value
 * @returns Whether it is current-version slice state
 */
export function isAshenGateSliceState(
  value: unknown,
): value is AshenGateSliceState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AshenGateSliceState>;
  if (candidate.version !== SLICE_STATE_VERSION) return false;
  if (typeof candidate.combat !== "object" || candidate.combat === null) {
    return false;
  }
  if (!Array.isArray(candidate.training)) return false;
  return (
    candidate.outcome === "playing" ||
    candidate.outcome === "victory" ||
    candidate.outcome === "defeat"
  );
}

/**
 * Reads the slice state or reports an invalid integration/load.
 * @param world - Sim world
 * @returns Mutable scenario state
 * @throws When the slice module never initialized this world
 */
export function sliceState(world: SimWorldState): AshenGateSliceState {
  const state = world.meta[ASHEN_GATE_SLICE_MODULE_ID];
  if (!isAshenGateSliceState(state)) {
    throw new Error("Ashen Gate slice state was not initialized");
  }
  return state;
}

/**
 * Reads the wave clock or reports an invalid module composition.
 * @param world - Sim world
 * @returns Mutable wave state
 * @throws When the waves module is missing
 */
export function waveState(world: SimWorldState): WaveClockState {
  if (!isWaveClockState(world.meta.waves)) {
    throw new Error("Ashen Gate waves were not initialized");
  }
  return world.meta.waves;
}

/**
 * Queues a toast. Repeats of the same text within a second are merged so a
 * busy fight does not flood the list.
 * @param world - Sim world
 * @param text - Player-facing message
 * @param tone - How the toast is coloured
 */
export function pushNotice(
  world: SimWorldState,
  text: string,
  tone: NoticeTone = "info",
): void {
  const state = sliceState(world);
  const duplicate = state.notices.some(
    (notice) => notice.text === text && world.tick - notice.tick < 20,
  );
  if (duplicate) return;
  state.notices.push({ id: state.nextNoticeId, text, tick: world.tick, tone });
  state.nextNoticeId += 1;
}

/**
 * Records a visual cue for the renderer.
 * @param world - Sim world
 * @param fx - Effect without id or tick
 */
export function pushFx(
  world: SimWorldState,
  fx: DistributiveOmit<SliceFx, "id" | "tick">,
): void {
  const state = sliceState(world);
  state.fx.push({ ...fx, id: state.nextFxId, tick: world.tick } as SliceFx);
  state.nextFxId += 1;
}

/**
 * Drops notices and effects that have aged out.
 * @param world - Sim world
 */
export function pruneTransient(world: SimWorldState): void {
  const state = sliceState(world);
  state.notices = state.notices.filter(
    (notice) => world.tick - notice.tick <= NOTICE_LIFETIME_TICKS,
  );
  state.fx = state.fx.filter((fx) => world.tick - fx.tick <= FX_LIFETIME_TICKS);
}

/** `Omit` that distributes over a union. */
type DistributiveOmit<TValue, TKey extends PropertyKey> = TValue extends unknown
  ? Omit<TValue, TKey>
  : never;
