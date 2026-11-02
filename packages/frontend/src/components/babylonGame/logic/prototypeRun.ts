import type { ThreeDPrototype } from "@resync-game-framework/api";

/** Versioned 3D-only save namespace; never overlaps climb/profile storage. */
export const THREE_D_SAVE_KEY = "coreborn.three-d.runs.v1";
/** Latest 3D world for the selector's resume affordance. */
export const THREE_D_LAST_WORLD_KEY = "coreborn.three-d.last-world.v1";
/** Pure game state used by both keyboard and accessible button controls. */
export interface PrototypeRun {
  version: 1;
  prototypeId: string;
  x: number;
  z: number;
  activated: string[];
  finished: boolean;
}
/** @returns A fresh run at the origin portal. */
export function startPrototypeRun(prototypeId: string): PrototypeRun {
  return {
    activated: [],
    finished: false,
    prototypeId,
    version: 1,
    x: 0,
    z: 0,
  };
}
/** Moves within the arena at bounded speed, independent of the renderer. */
export function movePrototypePlayer(
  state: PrototypeRun,
  x: number,
  z: number,
  seconds: number,
): PrototypeRun {
  if (state.finished || ![x, z, seconds].every(Number.isFinite)) return state;
  const length = Math.max(1, Math.hypot(x, z));
  const distance = Math.max(0, Math.min(seconds, 0.1)) * 4;
  return {
    ...state,
    x: Math.max(-7.5, Math.min(7.5, state.x + (x / length) * distance)),
    z: Math.max(-7.5, Math.min(7.5, state.z + (z / length) * distance)),
  };
}
/** @returns The nearby inactive beacon or portal which can currently be used. */
export function nearbyPrototypeInteraction(
  state: PrototypeRun,
  prototype: ThreeDPrototype,
): string | undefined {
  const props = prototype.slots.filter((slot) => slot.kind === "prop");
  const nearby = props.find(
    (slot) =>
      !state.activated.includes(slot.id) &&
      Math.hypot(slot.position[0] - state.x, slot.position[2] - state.z) <= 2,
  );
  if (nearby) return nearby.id;
  if (
    props.length > 0 &&
    props.every((slot) => state.activated.includes(slot.id)) &&
    Math.hypot(state.x, state.z) <= 2
  )
    return "portal";
  return undefined;
}
/** Applies one proximity-checked interaction and resolves the objective. */
export function interactWithPrototype(
  state: PrototypeRun,
  prototype: ThreeDPrototype,
): PrototypeRun {
  if (state.finished) return state;
  const id = nearbyPrototypeInteraction(state, prototype);
  if (!id) return state;
  if (id === "portal") return { ...state, finished: true };
  return { ...state, activated: [...state.activated, id] };
}
/** Reads damaged or obsolete saves defensively and scopes them to one package. */
export function parsePrototypeRun(
  raw: unknown,
  prototype: ThreeDPrototype,
): PrototypeRun {
  const fallback = startPrototypeRun(prototype.id);
  if (typeof raw !== "object" || raw === null) return fallback;
  const value = raw as Partial<PrototypeRun>;
  if (
    value.version !== 1 ||
    value.prototypeId !== prototype.id ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.z) ||
    !Array.isArray(value.activated)
  )
    return fallback;
  return {
    ...fallback,
    activated: [
      ...new Set(
        value.activated.filter((id) =>
          prototype.slots.some(
            (slot) => slot.kind === "prop" && slot.id === id,
          ),
        ),
      ),
    ],
    finished: value.finished === true,
    x: Math.max(-7.5, Math.min(7.5, value.x ?? 0)),
    z: Math.max(-7.5, Math.min(7.5, value.z ?? 0)),
  };
}
