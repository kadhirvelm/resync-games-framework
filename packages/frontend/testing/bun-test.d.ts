declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(
    name: string,
    fn: () => void | Promise<void>,
    options?: number | { timeout?: number },
  ): void;
  export namespace test {
    function only(name: string, fn: () => void | Promise<void>): void;
    function skip(name: string, fn: () => void | Promise<void>): void;
    function each<T extends readonly unknown[]>(
      cases: readonly T[],
    ): (name: string, fn: (...args: T) => void | Promise<void>) => void;
  }
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function expect(value: unknown): {
    toHaveLength(expected: number): void;
    toBe(expected: unknown | typeof expect.any): void;
    toEqual(expected: unknown | typeof expect.any): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toThrow(): void;
    toMatchSnapshot(): void;
    toContain(expected: string): void;
    toHaveBeenCalledTimes(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeCloseTo(expected: number, digits?: number): void;
    toMatchObject(expected: object): void;
    toBeDefined(): void;
    toContainEqual(expected: unknown | typeof expect.any): void;
    rejects: {
      toThrow(expected: unknown | typeof expect.any): void;
    };
    not: {
      toBe(expected: unknown | typeof expect.any): void;
      toEqual(expected: unknown | typeof expect.any): void;
      toBeTruthy(): void;
      toBeFalsy(): void;
      toBeNull(): void;
      toBeUndefined(): void;
      toThrow(): void;
      toMatchSnapshot(): void;
      toContain(expected: string): void;
      toBeDefined(): void;
      toHaveLength(expected: number): void;
    };
  };
  export namespace expect {
    function any(value: unknown): void;
  }
}
