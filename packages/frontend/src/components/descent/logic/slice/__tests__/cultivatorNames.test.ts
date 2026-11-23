import { describe, expect, test } from "bun:test";
import { createWorldState } from "../../sim/world";
import {
  assignUniqueCultivatorName,
  CULTIVATOR_NAME_POOL,
} from "../cultivatorNames";
import { ASHEN_GATE_SLICE_MODULE_ID, createSliceState } from "../sliceState";

function worldWithSlice(seed: number) {
  const world = createWorldState({ map: { height: 32, width: 32 }, seed });
  world.meta[ASHEN_GATE_SLICE_MODULE_ID] = createSliceState();
  return world;
}

describe("assignUniqueCultivatorName", () => {
  test("assigns deterministic unique names for a given seed and unit sequence", () => {
    const a = worldWithSlice(42);
    const b = worldWithSlice(42);
    const namesA = [
      assignUniqueCultivatorName(a, "ashen-captain"),
      assignUniqueCultivatorName(a, "sword_sage-1"),
      assignUniqueCultivatorName(a, "formation_master-2"),
    ];
    const namesB = [
      assignUniqueCultivatorName(b, "ashen-captain"),
      assignUniqueCultivatorName(b, "sword_sage-1"),
      assignUniqueCultivatorName(b, "formation_master-2"),
    ];
    expect(namesA).toEqual(namesB);
    expect(new Set(namesA).size).toBe(3);
  });

  test("never repeats a name even beyond the base pool size", () => {
    const world = worldWithSlice(9);
    const total = CULTIVATOR_NAME_POOL.length + 5;
    const issued = new Set<string>();
    for (let index = 0; index < total; index += 1) {
      const name = assignUniqueCultivatorName(world, `cultivator-${index}`);
      expect(issued.has(name)).toBe(false);
      issued.add(name);
    }
    expect(issued.size).toBe(total);
  });
});
