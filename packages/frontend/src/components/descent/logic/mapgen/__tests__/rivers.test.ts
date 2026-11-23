import { describe, expect, test } from "bun:test";
import { createMapRng } from "../random";
import {
  BRIDGE_HALF_GAP,
  carvePond,
  carveRiver,
  pickBridgeRows,
  placeWaterways,
} from "../rivers";

const HEIGHT = 156;
const anywhere = (): boolean => true;

/**
 * @param seed - RNG seed
 * @returns A river with two bridges
 */
function sampleRiver(seed: number) {
  const rng = createMapRng(seed, "rivers:test");
  return carveRiver({
    bridgeRows: [40, 110],
    canPlace: anywhere,
    centerX: 70,
    height: HEIGHT,
    idPrefix: "t-river",
    rng,
  });
}

describe("carveRiver", () => {
  test("is deterministic for a seed", () => {
    expect(sampleRiver(7)).toEqual(sampleRiver(7));
  });

  test("leaves a dry gap at each bridge and none elsewhere", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const river = sampleRiver(seed);
      for (const bridge of river.bridges) {
        const inGap = river.disks.filter(
          (disk) => Math.abs(disk.y - bridge.y) < BRIDGE_HALF_GAP,
        );
        expect(inGap).toHaveLength(0);
      }
      const rows = river.disks.map((disk) => disk.y).sort((a, b) => a - b);
      const gaps = rows
        .slice(1)
        .map((row, index) => row - (rows[index] as number))
        .filter((gap) => gap > 4);
      // Only the two bridge gaps break the chain.
      expect(gaps).toHaveLength(2);
    }
  });

  test("the bridge deck spans the water's width", () => {
    const [bridge] = sampleRiver(3).bridges;
    expect(bridge?.length).toBeGreaterThan(2 * 2.4);
    expect(bridge?.width).toBeGreaterThan(3);
  });

  test("never floods ground the placement rule protects", () => {
    const rng = createMapRng(9, "rivers:protect");
    const river = carveRiver({
      bridgeRows: [60],
      canPlace: (_x, y) => y < 100,
      centerX: 70,
      height: HEIGHT,
      idPrefix: "t-river",
      rng,
    });
    expect(river.disks.every((disk) => disk.y < 100)).toBe(true);
  });
});

describe("pickBridgeRows", () => {
  test("keeps one crossing near the horde lane and spaces them out", () => {
    const rng = createMapRng(11, "rivers:rows");
    const rows = pickBridgeRows(rng, 3, HEIGHT, 78);
    expect(rows).toHaveLength(3);
    expect(Math.min(...rows.map((row) => Math.abs(row - 78)))).toBeLessThan(8);
    for (let index = 1; index < rows.length; index += 1) {
      const gap = (rows[index] as number) - (rows[index - 1] as number);
      expect(gap).toBeGreaterThan(BRIDGE_HALF_GAP * 2);
    }
  });
});

describe("carvePond and placeWaterways", () => {
  test("a pond is a cluster around its center", () => {
    const rng = createMapRng(2, "rivers:pond");
    const pond = carvePond(rng, { x: 40, y: 40 }, "t-pond", anywhere);
    expect(pond.length).toBeGreaterThanOrEqual(4);
    for (const disk of pond) {
      expect(Math.hypot(disk.x - 40, disk.y - 40)).toBeLessThan(5);
    }
  });

  test("builds unique ids for every river, pond, and bridge", () => {
    const rng = createMapRng(5, "rivers:all");
    const { bridges, water } = placeWaterways({
      canPlace: anywhere,
      height: HEIGHT,
      idPrefix: "t",
      laneRowAt: () => 78,
      ponds: [{ x: 30, y: 30 }],
      rivers: [
        { bridgeCount: 2, centerShare: 0.3 },
        { bridgeCount: 3, centerShare: 0.6 },
      ],
      rng,
      width: 252,
    });
    expect(bridges).toHaveLength(5);
    const ids = [...water, ...bridges].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
