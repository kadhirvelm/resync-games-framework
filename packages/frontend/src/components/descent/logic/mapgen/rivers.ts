import type { SimRng } from "../sim/rng";
import { clamp, type MapPoint } from "./geometry";
import { randomBetween } from "./random";

/** One impassable water disk. Overlapping disks form a continuous channel. */
export interface WaterDisk {
  id: string;
  radius: number;
  x: number;
  y: number;
}

/** A walkable crossing left in a river. */
export interface RiverBridge {
  angle: number;
  id: string;
  length: number;
  width: number;
  x: number;
  y: number;
}

/** A carved river: its water disks and the bridges that cross it. */
export interface River {
  bridges: RiverBridge[];
  disks: WaterDisk[];
}

/** Inputs for {@link carveRiver}. */
export interface RiverSpec {
  /** Rows that must hold a bridge, in map tiles. */
  bridgeRows: readonly number[];
  /** Mean column of the channel. */
  centerX: number;
  /** Whether a disk of this radius may stand here (Camp aprons, vents, ...). */
  canPlace: (x: number, y: number, radius: number) => boolean;
  /** Map rows. */
  height: number;
  /** Prefix for generated ids, e.g. `ashen-river-1`. */
  idPrefix: string;
  /** Layout RNG. */
  rng: SimRng;
  /** Side-to-side wander of the channel, in tiles. */
  sway?: number;
}

/** Distance between neighboring disks; below `2 × radius` so banks overlap. */
const DISK_SPACING = 3.2;
/** Water disk radius range. */
const DISK_RADIUS = { max: 2.9, min: 2.4 } as const;
/** Rows either side of a bridge centre that stay dry. */
export const BRIDGE_HALF_GAP = 5.2;
/** Deck width, in tiles. */
const BRIDGE_WIDTH = 3.6;
/** Extra deck beyond the water's edge on each bank. */
const BRIDGE_BANK_REACH = 1.6;
/** Edge rows left dry so the channel does not touch the map border. */
const EDGE_ROWS = 1;

/**
 * Carves a north-south river as a chain of overlapping water disks that
 * wanders sideways, leaving a dry gap and a bridge at each requested row.
 * Disks that `canPlace` refuses leave extra fords, so protected ground is
 * never flooded.
 * @param spec - Channel position, bridges, and placement rule
 * @returns The river's disks and bridges; deterministic for a given RNG state
 */
export function carveRiver(spec: RiverSpec): River {
  const { bridgeRows, canPlace, centerX, height, idPrefix, rng } = spec;
  const sway = spec.sway ?? 7;
  const phase = randomBetween(rng, 0, Math.PI * 2);
  const wavelength = randomBetween(rng, 70, 110);
  const channelX = (y: number): number =>
    centerX + Math.sin((y / wavelength) * Math.PI * 2 + phase) * sway;

  const disks: WaterDisk[] = [];
  for (let y = EDGE_ROWS; y <= height - EDGE_ROWS; y += DISK_SPACING) {
    if (bridgeRows.some((row) => Math.abs(y - row) < BRIDGE_HALF_GAP)) continue;
    const radius = randomBetween(rng, DISK_RADIUS.min, DISK_RADIUS.max);
    const x = Math.round(channelX(y) * 2) / 2;
    const row = Math.round(y * 2) / 2;
    if (!canPlace(x, row, radius)) continue;
    disks.push({
      id: `${idPrefix}-${disks.length + 1}`,
      radius: Math.round(radius * 4) / 4,
      x,
      y: row,
    });
  }

  const bridges = bridgeRows.map((row, index) => {
    const slope = (channelX(row + 1) - channelX(row - 1)) / 2;
    return {
      // The deck crosses the channel at a right angle to its flow.
      angle: Math.round(Math.atan2(-slope, 1) * 100) / 100,
      id: `${idPrefix.replace("river", "bridge")}-${index + 1}`,
      length:
        Math.round((DISK_RADIUS.max * 2 + BRIDGE_BANK_REACH * 2) * 10) / 10,
      width: BRIDGE_WIDTH,
      x: Math.round(channelX(row) * 2) / 2,
      y: row,
    };
  });
  return { bridges, disks };
}

/**
 * Picks evenly spread bridge rows, with the first one pulled toward the
 * horde's lane so the main route always has a crossing.
 * @param rng - Layout RNG
 * @param count - Number of bridges
 * @param height - Map rows
 * @param laneRow - Row of the horde's straight lane
 * @returns Bridge rows, ascending
 */
export function pickBridgeRows(
  rng: SimRng,
  count: number,
  height: number,
  laneRow: number,
): number[] {
  const margin = BRIDGE_HALF_GAP + 6;
  const rows: number[] = [];
  const band = (height - margin * 2) / count;
  for (let index = 0; index < count; index += 1) {
    const center = margin + band * (index + 0.5);
    rows.push(Math.round(center + randomBetween(rng, -band / 4, band / 4)));
  }
  const nearest = rows.reduce(
    (best, row, index) =>
      Math.abs(row - laneRow) < Math.abs((rows[best] as number) - laneRow)
        ? index
        : best,
    0,
  );
  rows[nearest] = Math.round(
    clamp(laneRow + randomBetween(rng, -6, 6), margin, height - margin),
  );
  return rows.sort((left, right) => left - right);
}

/**
 * Builds a small pond as a tight cluster of water disks.
 * @param rng - Layout RNG
 * @param center - Pond centre
 * @param idPrefix - Prefix for generated ids
 * @param canPlace - Whether a disk of this radius may stand here
 * @returns The pond's disks (some may be dropped by `canPlace`)
 */
export function carvePond(
  rng: SimRng,
  center: MapPoint,
  idPrefix: string,
  canPlace: (x: number, y: number, radius: number) => boolean,
): WaterDisk[] {
  const disks: WaterDisk[] = [];
  const count = rng.int(4, 6);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const reach = index === 0 ? 0 : randomBetween(rng, 2.6, 3.6);
    const radius = randomBetween(rng, 2.8, 3.8);
    const x = Math.round((center.x + Math.cos(angle) * reach) * 2) / 2;
    const y = Math.round((center.y + Math.sin(angle) * reach) * 2) / 2;
    if (!canPlace(x, y, radius)) continue;
    disks.push({
      id: `${idPrefix}-${disks.length + 1}`,
      radius: Math.round(radius * 4) / 4,
      x,
      y,
    });
  }
  return disks;
}

/** One river a map wants: where it runs and how many bridges cross it. */
export interface WaterwayPlan {
  bridgeCount: number;
  /** Channel column as a share of the map width. */
  centerShare: number;
}

/** Inputs for {@link placeWaterways}. */
export interface WaterwaySpec {
  canPlace: (x: number, y: number, radius: number) => boolean;
  height: number;
  /** Row of the horde's straight lane at a column. */
  laneRowAt: (x: number) => number;
  /** Optional pond centres, one pond each. */
  ponds?: readonly MapPoint[];
  rivers: readonly WaterwayPlan[];
  /** Prefix such as `ashen`, giving ids `ashen-river-1-3`. */
  idPrefix: string;
  rng: SimRng;
  width: number;
}

/** Water and bridges for a whole map. */
export interface Waterways {
  bridges: RiverBridge[];
  water: (WaterDisk & { height: number })[];
}

/**
 * Lays every river and pond a map asks for.
 * @param spec - Rivers, ponds, and the placement rule
 * @returns Water disks (flat, impassable) and the bridges that cross them
 */
export function placeWaterways(spec: WaterwaySpec): Waterways {
  const { canPlace, height, idPrefix, laneRowAt, rng, width } = spec;
  const water: Waterways["water"] = [];
  const bridges: RiverBridge[] = [];
  spec.rivers.forEach((plan, index) => {
    const centerX = width * plan.centerShare;
    const river = carveRiver({
      bridgeRows: pickBridgeRows(
        rng,
        plan.bridgeCount,
        height,
        laneRowAt(centerX),
      ),
      canPlace,
      centerX,
      height,
      idPrefix: `${idPrefix}-river-${index + 1}`,
      rng,
    });
    for (const disk of river.disks) water.push({ ...disk, height: 0.1 });
    bridges.push(...river.bridges);
  });
  (spec.ponds ?? []).forEach((center, index) => {
    for (const disk of carvePond(
      rng,
      center,
      `${idPrefix}-pond-${index + 1}`,
      canPlace,
    )) {
      water.push({ ...disk, height: 0.1 });
    }
  });
  return { bridges, water };
}
