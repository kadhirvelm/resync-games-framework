/**
 * Seeded Ashen Gate layout. Every run gets a different arrangement from the
 * same recipe, and the same seed always rebuilds the same map.
 *
 * Pipeline:
 * 1. Drop the Camp on the west edge at a random height. The horde always
 *    enters from the middle of the east edge, so the Camp's height changes
 *    the angle of attack.
 * 2. Lay a line of Ember vents across that approach with one wider gap,
 *    which becomes the "Ember crossing" choke point.
 * 3. Place spirit veins: one beside the Camp, two on the horde's lane.
 * 4. Scatter Poisson-disk candidates (Bridson) and fill each resource slot
 *    with the best candidate in its distance band (Mitchell's best
 *    candidate). Near deposits spread around the Camp by angle; paired
 *    deposits take opposite flanks of the lane; everything else maximizes
 *    spacing. Constraints relax step by step if a band runs dry.
 * 5. Flood-fill from the Camp with villager movement rules to prove every
 *    deposit, vein, and the horde gate is reachable and that the opening
 *    deposits are a fair walk. A failed layout is rerolled.
 */

import type { UnitInit } from "../../../logic/economy";
import { footprintRadius } from "../../../logic/economy/footprint";
import type { ResourceNode, SpiritVein } from "../../../logic/economy/model";
import type { CircleVolume } from "../../../logic/layers";
import {
  angleBetween,
  clamp,
  createMapRng,
  distance,
  distanceToSegment,
  floodDistances,
  headingBetween,
  type MapPoint,
  nearestDistance,
  pickBest,
  poissonDiskSample,
  polarOffset,
  randomBetween,
  sideOfLine,
  stepsTo,
  stepsToBeside,
  toCell,
} from "../../../logic/mapgen";
import type { SimRng } from "../../../logic/sim/rng";
import { SPAWN_EAST_INSET } from "../../../logic/waves/constants";
import {
  ASHEN_GATE_MAP_SIZE,
  ASHEN_GATE_NODE_SLOTS,
  ASHEN_GATE_STARTING_VILLAGERS,
  ASHEN_GATE_STOCKPILE,
  type AshenGateMap,
  type AshenGateNodeSlot,
} from "./map";

/** Rerolls tried before the least-bad layout is kept. */
const MAX_LAYOUT_ATTEMPTS = 8;
/** Columns the Camp may stand in. */
const CAMP_COLUMNS = { max: 20, min: 14 } as const;
/** How far the Camp may sit above or below the middle, as a share of height. */
const CAMP_HEIGHT_SPREAD = 0.2;
/**
 * Cells from the Camp's center to the edge of its square. Distances below
 * that are measured from the center are pushed out by this much, so the
 * ground around the Camp stays the same size however large the Camp is.
 */
const CAMP_EDGE = footprintRadius("camp");
/** Open ground around the Camp kept free of deposits for the first buildings. */
const BUILD_APRON = 6 + CAMP_EDGE;
/** Tiles from the map edge kept free of deposits. */
const EDGE_MARGIN = 3;
/** Smallest gap between Poisson-disk candidates. */
const CANDIDATE_SPACING = 3.5;
/** Distance from the Camp to the vent line. */
const CROSSING_DISTANCE = { max: 30, min: 24 } as const;
/** Edge-to-edge gaps between neighboring vents. */
const VENT_GAP = { max: 4.5, min: 2.5 } as const;
/** The one wider gap that forms the Ember crossing. */
const CROSSING_GAP = { max: 7, min: 5 } as const;
/** Tiles kept between a deposit or vein and a vent's rim. */
const VENT_CLEARANCE = 2.5;
/** Tiles kept between a deposit and a spirit vein. */
const VEIN_CLEARANCE = 3;
/** The horde's arrival block, kept clear: columns from the east edge. */
const SPAWN_CLEARING_COLUMNS = 16;
/** The horde's arrival block, kept clear: rows above and below the middle. */
const SPAWN_CLEARING_ROWS = 18;
/** Farthest walk, in steps, from the Camp's center to an opening deposit. */
const MAX_NEAR_STEPS = 16 + CAMP_EDGE;
/** Distance band, from the Camp's center, for opening deposits. */
const NEAR_BAND = { max: 11.5 + CAMP_EDGE, min: 6.5 + CAMP_EDGE } as const;
/** Distance band, from the Camp's center, for mid-field deposits. */
const MID_BAND = { max: 22 + CAMP_EDGE, min: 14 + CAMP_EDGE } as const;
/** Rounds of loosening a slot's rules before taking any open candidate. */
const MAX_RELAX = 3;

/** Inputs every placement step reads. */
interface LayoutFrame {
  camp: MapPoint;
  crossingDistance: number;
  heading: number;
  rng: SimRng;
  spawn: MapPoint;
  vents: readonly CircleVolume[];
}

/**
 * Builds a reachable, fair Ashen Gate map for one run.
 * @param seed - Run seed
 * @returns A complete map package; the same seed always returns the same map
 */
export function generateAshenGateMap(seed: number): AshenGateMap {
  let best: AshenGateMap | null = null;
  let bestProblems = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < MAX_LAYOUT_ATTEMPTS; attempt += 1) {
    const map = layoutAttempt(seed, attempt);
    const problems = validateAshenGateMap(map).length;
    if (problems === 0) return map;
    if (problems >= bestProblems) continue;
    best = map;
    bestProblems = problems;
  }
  return best ?? layoutAttempt(seed, 0);
}

/**
 * Lists every rule a layout breaks. An empty list means the map is playable.
 * @param map - Generated map
 * @returns Human-readable problems
 */
export function validateAshenGateMap(map: AshenGateMap): string[] {
  const problems: string[] = [];
  const camp = map.buildings.find((entry) => entry.buildingType === "camp");
  if (!camp) return ["no Camp"];
  const size = { height: map.height, width: map.width };
  const nodeCells = new Set(map.nodes.map((node) => cellKey(node)));
  if (nodeCells.size !== map.nodes.length) problems.push("deposits overlap");
  const field = floodDistances(size, camp, (x, y) => {
    if (nodeCells.has(`${x},${y}`)) return false;
    if (x === camp.x && y === camp.y) return false;
    return !insideAnyVent(map.vents, { x, y });
  });
  for (const node of map.nodes) {
    problems.push(...depositProblems(map, node, stepsToBeside(field, node)));
  }
  for (const vein of map.veins) {
    if (insideAnyVent(map.vents, vein)) problems.push(`${vein.id} in a vent`);
    if (stepsTo(field, vein) < 0) problems.push(`${vein.id} unreachable`);
  }
  const gate = {
    x: map.width - SPAWN_EAST_INSET,
    y: Math.round(map.height / 2),
  };
  if (stepsTo(field, gate) < 0) problems.push("horde gate unreachable");
  return problems;
}

/**
 * @param map - Generated map
 * @param node - Deposit to check
 * @param steps - Walk from the Camp to beside the deposit, -1 if none
 * @returns Problems with this one deposit
 */
function depositProblems(
  map: AshenGateMap,
  node: ResourceNode,
  steps: number,
): string[] {
  const problems: string[] = [];
  if (!onMap(map, node)) problems.push(`${node.id} off the map`);
  if (insideAnyVent(map.vents, node)) problems.push(`${node.id} in a vent`);
  if (steps < 0) problems.push(`${node.id} unreachable`);
  const slot = ASHEN_GATE_NODE_SLOTS.find((entry) => entry.id === node.id);
  if (slot?.band === "near" && steps > MAX_NEAR_STEPS) {
    problems.push(`${node.id} is ${steps} steps from the Camp`);
  }
  return problems;
}

/**
 * One full layout from a derived seed.
 * @param seed - Run seed
 * @param attempt - Reroll index, mixed into the seed
 * @returns An unvalidated map
 */
function layoutAttempt(seed: number, attempt: number): AshenGateMap {
  const { height, width } = ASHEN_GATE_MAP_SIZE;
  const rng = createMapRng(seed, `ashen_gate:layout:${attempt}`);
  const spawn = { x: width - SPAWN_EAST_INSET, y: height / 2 };
  const camp = {
    x: rng.int(CAMP_COLUMNS.min, CAMP_COLUMNS.max),
    y: Math.round(
      height / 2 + randomBetween(rng, -1, 1) * height * CAMP_HEIGHT_SPREAD,
    ),
  };
  const heading = headingBetween(camp, spawn) + randomBetween(rng, -0.12, 0.12);
  const crossingDistance = randomBetween(
    rng,
    CROSSING_DISTANCE.min,
    CROSSING_DISTANCE.max,
  );
  const vents = placeVents(rng, camp, heading, crossingDistance);
  const frame = { camp, crossingDistance, heading, rng, spawn, vents };
  const veins = placeVeins(frame);
  const nodes = placeNodes(frame, veins);
  return {
    buildings: [
      { buildingType: "camp", completed: true, id: "ashen-camp", ...camp },
    ],
    chokePoints: [
      {
        id: "west-choke",
        label: "Hold approach",
        ...insideMap(polarOffset(camp, heading, crossingDistance / 2), 1),
      },
      { id: "vent-choke", label: "Ember crossing", ...crossingPoint(vents) },
    ],
    height,
    nodes,
    stockpile: { ...ASHEN_GATE_STOCKPILE },
    units: startingUnits(camp, heading),
    veins,
    vents,
    width,
  };
}

/**
 * Lays a line of 3–4 vents across the approach, one gap wider than the rest.
 * @param rng - Layout RNG
 * @param camp - Camp cell
 * @param heading - Direction from the Camp toward the horde
 * @param crossingDistance - Distance from the Camp to the line's center
 * @returns Vents in order along the line
 */
function placeVents(
  rng: SimRng,
  camp: MapPoint,
  heading: number,
  crossingDistance: number,
): CircleVolume[] {
  const center = polarOffset(camp, heading, crossingDistance);
  const lineAngle = heading + Math.PI / 2 + randomBetween(rng, -0.35, 0.35);
  const count = rng.int(3, 4);
  const radii = Array.from(
    { length: count },
    () => Math.round(randomBetween(rng, 2, 2.75) * 4) / 4,
  );
  const wideGap = rng.int(0, count - 2);
  const offsets = [0];
  for (let index = 1; index < count; index += 1) {
    const range = index - 1 === wideGap ? CROSSING_GAP : VENT_GAP;
    const gap = randomBetween(rng, range.min, range.max);
    const previous = offsets[index - 1] as number;
    offsets.push(
      previous + (radii[index - 1] as number) + (radii[index] as number) + gap,
    );
  }
  const middle = (offsets.at(-1) as number) / 2 + randomBetween(rng, -3, 3);
  return offsets.map((offset, index) => {
    const radius = radii[index] as number;
    const along = polarOffset(center, lineAngle, offset - middle);
    const point = polarOffset(along, heading, randomBetween(rng, -2, 2));
    return { radius, ...insideMap(point, radius + 2) };
  });
}

/**
 * @param vents - Vents in line order
 * @returns The cell in the middle of the widest gap between neighbors
 */
function crossingPoint(vents: readonly CircleVolume[]): MapPoint {
  let best = {
    gap: Number.NEGATIVE_INFINITY,
    point: toCell(vents[0] ?? { x: 0, y: 0 }),
  };
  for (let index = 1; index < vents.length; index += 1) {
    const from = vents[index - 1] as CircleVolume;
    const to = vents[index] as CircleVolume;
    const span = distance(from, to);
    const gap = span - from.radius - to.radius;
    if (gap <= best.gap || span === 0) continue;
    const share = (from.radius + gap / 2) / span;
    best = {
      gap,
      point: toCell({
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share,
      }),
    };
  }
  return best.point;
}

/**
 * One vein beside the Camp, one at the middle of the lane, one near the
 * frontier. Each is nudged off any vent it lands in.
 * @param frame - Layout inputs
 * @returns Spirit veins
 */
function placeVeins(frame: LayoutFrame): SpiritVein[] {
  const { camp, heading, rng } = frame;
  const hold = polarOffset(
    camp,
    heading + randomBetween(rng, -0.3, 0.3),
    randomBetween(rng, 6 + CAMP_EDGE, 8 + CAMP_EDGE),
  );
  return [
    { id: "ashen-vein-hold", ...clearOfVents(frame, hold) },
    {
      id: "ashen-vein-choke",
      ...clearOfVents(frame, lanePoint(frame, randomBetween(rng, 0.36, 0.44))),
    },
    {
      id: "ashen-vein-frontier",
      ...clearOfVents(frame, lanePoint(frame, randomBetween(rng, 0.66, 0.74))),
    },
  ];
}

/**
 * A point on the Camp-to-gate lane at a given map column, jittered sideways.
 * @param frame - Layout inputs
 * @param column - Column as a share of the map width
 * @returns A point near the lane
 */
function lanePoint(frame: LayoutFrame, column: number): MapPoint {
  const { camp, rng, spawn } = frame;
  const x = ASHEN_GATE_MAP_SIZE.width * column;
  const t = clamp((x - camp.x) / (spawn.x - camp.x), 0, 1);
  return {
    x,
    y: camp.y + (spawn.y - camp.y) * t + randomBetween(rng, -5, 5),
  };
}

/**
 * Walks a point toward the horde until it clears every vent.
 * @param frame - Layout inputs
 * @param point - Desired point
 * @returns The nearest clear cell along the heading
 */
function clearOfVents(frame: LayoutFrame, point: MapPoint): MapPoint {
  let cell = insideMap(point, EDGE_MARGIN);
  for (let step = 0; step < 12 && nearVent(frame.vents, cell); step += 1) {
    cell = insideMap(polarOffset(cell, frame.heading, 2), EDGE_MARGIN);
  }
  return cell;
}

/**
 * Fills every resource slot, most constrained first.
 * @param frame - Layout inputs
 * @param veins - Veins already placed
 * @returns Deposits in slot order
 */
function placeNodes(
  frame: LayoutFrame,
  veins: readonly SpiritVein[],
): ResourceNode[] {
  const { height, width } = ASHEN_GATE_MAP_SIZE;
  const candidates = uniqueCells(
    poissonDiskSample(
      frame.rng,
      {
        height: height - EDGE_MARGIN * 2,
        width: width - EDGE_MARGIN * 2,
        x: EDGE_MARGIN,
        y: EDGE_MARGIN,
      },
      CANDIDATE_SPACING,
    ),
  ).filter((cell) => openGround(frame, veins, cell));
  const placed: ResourceNode[] = [];
  const sides = new Map<string, -1 | 1>();
  for (const slot of ASHEN_GATE_NODE_SLOTS) {
    const side = pairSide(frame.rng, sides, slot);
    const cell = placeSlot(frame, candidates, placed, slot, side);
    if (slot.pair && !sides.has(slot.pair)) {
      sides.set(slot.pair, sideOfLane(frame, cell) === 1 ? -1 : 1);
    }
    placed.push({
      id: slot.id,
      nodeType: slot.nodeType,
      remaining: slot.remaining,
      resourceId: slot.resourceId,
      ...cell,
    });
  }
  return placed;
}

/**
 * The flank a paired slot must take: random for the first of a pair, the
 * opposite of its partner for the second.
 * @param rng - Layout RNG
 * @param sides - Side already owed to each pair's second member
 * @param slot - Slot being placed
 * @returns Required side, or null when the slot has no pair
 */
function pairSide(
  rng: SimRng,
  sides: ReadonlyMap<string, -1 | 1>,
  slot: AshenGateNodeSlot,
): -1 | 1 | null {
  if (!slot.pair) return null;
  const owed = sides.get(slot.pair);
  if (owed !== undefined) return owed;
  return rng.next() < 0.5 ? -1 : 1;
}

/**
 * Picks the best candidate for one slot, loosening its rules until one fits.
 * @param frame - Layout inputs
 * @param candidates - Open candidate cells
 * @param placed - Deposits already placed
 * @param slot - Slot to fill
 * @param side - Required flank, or null
 * @returns The chosen cell
 * @throws When no open candidate is left at all
 */
function placeSlot(
  frame: LayoutFrame,
  candidates: readonly MapPoint[],
  placed: readonly ResourceNode[],
  slot: AshenGateNodeSlot,
  side: -1 | 1 | null,
): MapPoint {
  const taken = new Set(placed.map((node) => cellKey(node)));
  const free = candidates.filter((cell) => !taken.has(cellKey(cell)));
  for (let relax = 0; relax <= MAX_RELAX; relax += 1) {
    const choice = pickBest(free, (cell) => {
      if (!fitsSlot(frame, placed, slot, side, cell, relax)) return null;
      return slotScore(frame, placed, slot, cell);
    });
    if (choice) return choice;
  }
  const fallback = pickBest(free, (cell) => -distance(cell, frame.camp));
  if (!fallback) throw new Error(`No open ground left for ${slot.id}`);
  return fallback;
}

/**
 * @param frame - Layout inputs
 * @param placed - Deposits already placed
 * @param slot - Slot being filled
 * @param side - Required flank, or null
 * @param cell - Candidate
 * @param relax - How far the band and spacing rules are loosened (0 = strict)
 * @returns Whether the candidate satisfies the slot at this relax level
 */
function fitsSlot(
  frame: LayoutFrame,
  placed: readonly ResourceNode[],
  slot: AshenGateNodeSlot,
  side: -1 | 1 | null,
  cell: MapPoint,
  relax: number,
): boolean {
  const spacing = (slot.band === "near" ? 4.5 : 8) * (1 - 0.25 * relax);
  if (nearestDistance(cell, placed) < spacing) return false;
  if (side !== null && relax < 2 && sideOfLane(frame, cell) !== side) {
    return false;
  }
  return inBand(frame, slot, cell, relax);
}

/**
 * @param frame - Layout inputs
 * @param slot - Slot being filled
 * @param cell - Candidate
 * @param relax - Widening step, 0 = strict
 * @returns Whether the candidate lies in the slot's distance band
 */
function inBand(
  frame: LayoutFrame,
  slot: AshenGateNodeSlot,
  cell: MapPoint,
  relax: number,
): boolean {
  const reach = distance(cell, frame.camp);
  const ahead = progress(frame, cell);
  const crossing = frame.crossingDistance;
  const widen = 1 + 0.2 * relax;
  if (slot.band === "near") {
    return (
      reach >= NEAR_BAND.min &&
      reach <= NEAR_BAND.max * widen &&
      ahead <= crossing - 8
    );
  }
  const lane = laneDistance(frame, cell);
  if (slot.band === "mid") {
    return (
      reach >= MID_BAND.min / widen &&
      reach <= MID_BAND.max * widen &&
      ahead >= (crossing * 0.35) / widen &&
      ahead <= crossing + 2
    );
  }
  if (slot.band === "frontier") {
    return (
      ahead >= crossing + 5 &&
      ahead <= crossing + 16 * widen &&
      lane >= 4 &&
      lane <= 22 * widen
    );
  }
  const column = (slot.targetX ?? 0.5) * ASHEN_GATE_MAP_SIZE.width;
  return (
    Math.abs(cell.x - column) <= 8 * widen &&
    lane >= 10 / widen &&
    lane <= 36 * widen
  );
}

/**
 * Near deposits fan out around the Camp by angle. The rest keep some room
 * from what is already placed (capped, so nothing is pushed to the map edge)
 * and drift toward their band's sweet spot. Noise varies runs.
 * @param frame - Layout inputs
 * @param placed - Deposits already placed
 * @param slot - Slot being filled
 * @param cell - Candidate that fits the slot
 * @returns Higher is better
 */
function slotScore(
  frame: LayoutFrame,
  placed: readonly ResourceNode[],
  slot: AshenGateNodeSlot,
  cell: MapPoint,
): number {
  const noise = frame.rng.next();
  if (slot.band === "near") {
    const angle = headingBetween(frame.camp, cell);
    const spread = placed.reduce(
      (smallest, node) =>
        Math.min(
          smallest,
          angleBetween(angle, headingBetween(frame.camp, node)),
        ),
      Math.PI,
    );
    const preferred = 9 + CAMP_EDGE;
    return (
      spread * 10 - Math.abs(distance(cell, frame.camp) - preferred) + noise * 2
    );
  }
  const room = Math.min(nearestDistance(cell, placed), 12);
  return room - bandDrift(frame, slot, cell) + noise * 5;
}

/**
 * How far a candidate sits from its band's preferred spot.
 * @param frame - Layout inputs
 * @param slot - Slot being filled
 * @param cell - Candidate
 * @returns A penalty, 0 at the sweet spot
 */
function bandDrift(
  frame: LayoutFrame,
  slot: AshenGateNodeSlot,
  cell: MapPoint,
): number {
  const ahead = progress(frame, cell);
  const lane = laneDistance(frame, cell);
  if (slot.band === "mid") {
    return Math.abs(ahead - frame.crossingDistance * 0.6) * 0.5;
  }
  if (slot.band === "frontier") {
    return (
      Math.abs(ahead - (frame.crossingDistance + 9)) * 0.4 +
      Math.max(0, lane - 14) * 0.5
    );
  }
  const column = (slot.targetX ?? 0.5) * ASHEN_GATE_MAP_SIZE.width;
  return Math.abs(cell.x - column) * 0.25 + Math.abs(lane - 20) * 0.3;
}

/**
 * Ground a deposit may ever use: off the Camp's apron, clear of vents,
 * veins, and the horde's arrival block.
 * @param frame - Layout inputs
 * @param veins - Veins already placed
 * @param cell - Candidate
 * @returns Whether a deposit could stand here
 */
function openGround(
  frame: LayoutFrame,
  veins: readonly SpiritVein[],
  cell: MapPoint,
): boolean {
  const { height, width } = ASHEN_GATE_MAP_SIZE;
  if (distance(cell, frame.camp) < BUILD_APRON) return false;
  if (nearVent(frame.vents, cell)) return false;
  if (nearestDistance(cell, veins) < VEIN_CLEARANCE) return false;
  const inArrival =
    cell.x >= width - SPAWN_CLEARING_COLUMNS &&
    Math.abs(cell.y - height / 2) <= SPAWN_CLEARING_ROWS;
  return !inArrival;
}

/**
 * The opening force: the captain a few steps toward the vents, and the
 * villagers in a column behind the Camp, both clear of the Camp's square.
 * @param camp - Camp cell
 * @param heading - Direction toward the horde
 * @returns Units to seed
 */
function startingUnits(camp: MapPoint, heading: number): UnitInit[] {
  const behind = polarOffset(
    camp,
    heading + Math.PI,
    footprintRadius("camp") + 2,
  );
  return [
    {
      classId: "warden",
      id: "ashen-captain",
      maxHp: 140,
      popKind: "soldier",
      realmId: "qi_gathering",
      ...insideMap(polarOffset(camp, heading, footprintRadius("camp") + 2), 1),
    },
    ...Array.from(
      { length: ASHEN_GATE_STARTING_VILLAGERS },
      (_, index): UnitInit => ({
        id: `ashen-villager-${index + 1}`,
        ...insideMap(
          polarOffset(behind, heading + Math.PI / 2, (index - 1) * 2),
          1,
        ),
      }),
    ),
  ];
}

/**
 * @param frame - Layout inputs
 * @param cell - Point to measure
 * @returns How far the point is along the Camp's heading toward the horde
 */
function progress(frame: LayoutFrame, cell: MapPoint): number {
  return (
    (cell.x - frame.camp.x) * Math.cos(frame.heading) +
    (cell.y - frame.camp.y) * Math.sin(frame.heading)
  );
}

/**
 * @param frame - Layout inputs
 * @param cell - Point to measure
 * @returns Distance from the straight horde lane between gate and Camp
 */
function laneDistance(frame: LayoutFrame, cell: MapPoint): number {
  return distanceToSegment(cell, frame.camp, frame.spawn);
}

/**
 * @param frame - Layout inputs
 * @param cell - Point to classify
 * @returns Which flank of the lane the point is on (0 counts as -1)
 */
function sideOfLane(frame: LayoutFrame, cell: MapPoint): -1 | 1 {
  return sideOfLine(cell, frame.camp, frame.spawn) === 1 ? 1 : -1;
}

/**
 * @param vents - Vents on the map
 * @param cell - Point to test
 * @returns Whether the point is within the clearance ring of any vent
 */
function nearVent(vents: readonly CircleVolume[], cell: MapPoint): boolean {
  return vents.some(
    (vent) => distance(vent, cell) < vent.radius + VENT_CLEARANCE,
  );
}

/**
 * Matches the movement rule: a cell whose center lies in a disk (plus a hair
 * of clearance) burns.
 * @param vents - Vents on the map
 * @param cell - Cell to test
 * @returns Whether the cell burns
 */
function insideAnyVent(
  vents: readonly CircleVolume[],
  cell: MapPoint,
): boolean {
  return vents.some((vent) => distance(vent, cell) <= vent.radius + 0.05);
}

/**
 * @param point - Desired point
 * @param margin - Tiles to keep from every edge
 * @returns The nearest whole cell inside the margin
 */
function insideMap(point: MapPoint, margin: number): MapPoint {
  const { height, width } = ASHEN_GATE_MAP_SIZE;
  return toCell({
    x: clamp(point.x, margin, width - 1 - margin),
    y: clamp(point.y, margin, height - 1 - margin),
  });
}

/**
 * @param map - Map bounds
 * @param cell - Cell to test
 * @returns Whether the cell is on the map
 */
function onMap(map: AshenGateMap, cell: MapPoint): boolean {
  return (
    cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height
  );
}

/**
 * @param points - Fractional points
 * @returns Their whole cells, duplicates removed, order kept
 */
function uniqueCells(points: readonly MapPoint[]): MapPoint[] {
  const seen = new Set<string>();
  const cells: MapPoint[] = [];
  for (const point of points) {
    const cell = toCell(point);
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(cell);
  }
  return cells;
}

/**
 * @param cell - Cell
 * @returns Stable `x,y` key
 */
function cellKey(cell: MapPoint): string {
  return `${cell.x},${cell.y}`;
}
