/** Anything that stores the RNG cursor; the world state does. */
export interface RngCursorHolder {
  rngState: number;
}

/** Seeded random source owned by the sim. Never use `Math.random` in a tick. */
export interface SimRng {
  /** @returns A float in [0, 1). */
  next(): number;
  /**
   * @param minInclusive - Lowest integer that may be returned
   * @param maxInclusive - Highest integer that may be returned
   * @returns A uniformly distributed integer in the range
   */
  int(minInclusive: number, maxInclusive: number): number;
  /**
   * @param items - Non-empty list to choose from
   * @returns One item chosen uniformly
   */
  pick<TItem>(items: readonly TItem[]): TItem;
}

/**
 * Normalizes any number into a 32-bit unsigned seed.
 * @param seed - Requested seed
 * @returns An integer in [0, 2^32)
 */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`Descent seed must be finite, received ${seed}`);
  }
  return Math.trunc(seed) >>> 0;
}

/**
 * Advances a mulberry32 cursor once.
 * @param state - Current 32-bit cursor
 * @returns The next cursor and a float in [0, 1)
 */
export function mulberry32Step(state: number): {
  state: number;
  value: number;
} {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let mixed = nextState;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const value = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  return { state: nextState, value };
}

/**
 * Creates an RNG that reads and writes its cursor on the holder, so
 * serializing the holder captures the exact position in the sequence.
 * @param holder - Object whose `rngState` is the live cursor
 * @returns Deterministic random helpers
 */
export function createSimRng(holder: RngCursorHolder): SimRng {
  const next = () => {
    const step = mulberry32Step(holder.rngState);
    holder.rngState = step.state;
    return step.value;
  };
  return {
    int(minInclusive, maxInclusive) {
      if (maxInclusive < minInclusive) {
        throw new RangeError("rng.int max must be at least min");
      }
      const span = Math.floor(maxInclusive) - Math.ceil(minInclusive) + 1;
      return Math.ceil(minInclusive) + Math.floor(next() * span);
    },
    next,
    pick(items) {
      if (items.length === 0) {
        throw new RangeError("rng.pick needs at least one item");
      }
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
  };
}
