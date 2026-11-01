/**
 * Seeded random numbers for a run. The state is a plain number so it can
 * live inside run state and make every climb reproducible from its seed.
 */

/** Result of one draw: the value in [0, 1) and the state for the next draw. */
export interface RandomDraw {
  state: number;
  value: number;
}

/**
 * Advances a mulberry32 generator by one step.
 * @param state - Current 32-bit generator state
 * @returns A value in [0, 1) and the next state
 */
export function nextRandom(state: number): RandomDraw {
  const nextState = (state + 0x6d2b79f5) | 0;
  let mixed = nextState;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const value = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  return { state: nextState, value };
}

/**
 * Small mutable wrapper for code that needs several draws in a row.
 * Read `state` afterward to store where the sequence stopped.
 */
export class SeededRandom {
  public state: number;

  /**
   * @param state - Generator state to start from
   */
  public constructor(state: number) {
    this.state = state | 0;
  }

  /**
   * @returns A value in [0, 1)
   */
  public next(): number {
    const draw = nextRandom(this.state);
    this.state = draw.state;
    return draw.value;
  }

  /**
   * @param maxExclusive - Upper bound, at least 1
   * @returns An integer in [0, maxExclusive)
   */
  public int(maxExclusive: number): number {
    return Math.floor(this.next() * Math.max(1, maxExclusive));
  }

  /**
   * @param items - Non-empty list to pick from
   * @returns One entry, or `undefined` for an empty list
   */
  public pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) {
      return undefined;
    }
    return items[this.int(items.length)];
  }

  /**
   * Fisher-Yates shuffle that leaves the input untouched.
   * @param items - Entries to shuffle
   * @returns A shuffled copy
   */
  public shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = this.int(index + 1);
      const held = copy[index] as T;
      copy[index] = copy[swap] as T;
      copy[swap] = held;
    }
    return copy;
  }
}

/**
 * @returns A fresh seed from the clock and `Math.random`
 */
export function createSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}
