/**
 * Seeded Ashen Crucible multiplayer co-op map generator.
 *
 * Places 1–4 allied player Camps along a western crescent, each with its own
 * Captain Warden, three Villagers, and four nearby starter resource deposits.
 * Across the center sits a staggered ridge of Ember Vents carving three
 * defensive lanes between the allied Holds and the eastern Horde Gate.
 */

import type { BuildingInit, UnitInit } from "../../../logic/economy";
import { footprintRadius } from "../../../logic/economy/footprint";
import type { ResourceNode, SpiritVein } from "../../../logic/economy/model";
import type { CircleVolume } from "../../../logic/layers";
import {
  clamp,
  createMapRng,
  distance,
  floodDistances,
  headingBetween,
  type MapPoint,
  nearestDistance,
  pickBest,
  poissonDiskSample,
  polarOffset,
  randomBetween,
  stepsTo,
  stepsToBeside,
  toCell,
} from "../../../logic/mapgen";
import type { SimRng } from "../../../logic/sim/rng";
import { SPAWN_EAST_INSET } from "../../../logic/waves/constants";
import {
  ASHEN_CRUCIBLE_MAP_SIZE,
  ASHEN_CRUCIBLE_SHARED_SLOTS,
  ASHEN_CRUCIBLE_STARTER_NODES,
  ASHEN_CRUCIBLE_STARTING_VILLAGERS,
  type AshenCrucibleMap,
  type AshenCruciblePlayer,
  type AshenCrucibleSharedSlot,
  ashenCrucibleStockpile,
} from "./map";

const MAX_LAYOUT_ATTEMPTS = 8;
const CAMP_EDGE = footprintRadius("camp");
const BUILD_APRON = 5.5 + CAMP_EDGE;
const EDGE_MARGIN = 4;
const CANDIDATE_SPACING = 4;
const VENT_CLEARANCE = 2.5;
const VEIN_CLEARANCE = 3;
const SPAWN_CLEARING_COLUMNS = 18;
const SPAWN_CLEARING_ROWS = 22;

interface CampPlacement {
  camp: MapPoint;
  heading: number;
  player: AshenCruciblePlayer;
}

/**
 * Generates a reachable, balanced Ashen Crucible co-op map for 1–4 players.
 * @param seed - Deterministic run seed
 * @param players - Locked co-op roster (1..4 players)
 * @returns A complete map package; identical seed and roster reproduce the same map
 */
export function generateAshenCrucibleMap(
  seed: number,
  players: readonly AshenCruciblePlayer[],
): AshenCrucibleMap {
  const normalizedPlayers: AshenCruciblePlayer[] =
    players.length > 0
      ? players.slice(0, 4)
      : [{ color: "#f2c14e", id: "player-1", name: "Player 1", slotIndex: 0 }];

  let best: AshenCrucibleMap | null = null;
  let bestProblems = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < MAX_LAYOUT_ATTEMPTS; attempt += 1) {
    const map = layoutAttempt(seed, attempt, normalizedPlayers);
    const problems = validateAshenCrucibleMap(map).length;
    if (problems === 0) return map;
    if (problems >= bestProblems) continue;
    best = map;
    bestProblems = problems;
  }
  return best ?? layoutAttempt(seed, 0, normalizedPlayers);
}

/**
 * Verifies every Camp, deposit, vein, and the eastern Horde Gate is reachable.
 * @param map - Candidate multiplayer map
 * @returns Human-readable validation problems (empty when playable)
 */
export function validateAshenCrucibleMap(map: AshenCrucibleMap): string[] {
  const problems: string[] = [];
  const camps = map.buildings.filter((entry) => entry.buildingType === "camp");
  if (camps.length === 0) return ["no Camps"];

  const size = { height: map.height, width: map.width };
  const nodeCells = new Set(map.nodes.map((node) => cellKey(node)));
  if (nodeCells.size !== map.nodes.length) {
    problems.push("deposits overlap");
  }
  const campCells = new Set(camps.map((camp) => cellKey(camp)));
  const primaryCamp = camps[0] as BuildingInit;
  const field = floodDistances(size, primaryCamp, (x, y) => {
    if (nodeCells.has(`${x},${y}`)) return false;
    if (campCells.has(`${x},${y}`)) return false;
    return !insideAnyVent(map.vents, { x, y });
  });

  for (const camp of camps) {
    if (stepsToBeside(field, camp) < 0) {
      problems.push(`${camp.id} isolated`);
    }
  }
  for (const node of map.nodes) {
    if (!onMap(map, node)) problems.push(`${node.id} off the map`);
    if (insideAnyVent(map.vents, node)) problems.push(`${node.id} in a vent`);
    if (stepsToBeside(field, node) < 0) problems.push(`${node.id} unreachable`);
  }
  for (const vein of map.veins) {
    if (insideAnyVent(map.vents, vein)) problems.push(`${vein.id} in a vent`);
    if (stepsTo(field, vein) < 0) problems.push(`${vein.id} unreachable`);
  }
  const gate = {
    x: map.width - SPAWN_EAST_INSET,
    y: Math.round(map.height / 2),
  };
  if (stepsTo(field, gate) < 0) {
    problems.push("horde gate unreachable");
  }
  return problems;
}

/**
 * Builds one layout attempt from a derived RNG stream.
 * @param seed - Run seed
 * @param attempt - Reroll counter
 * @param players - Active co-op roster
 * @returns Unvalidated map
 */
function layoutAttempt(
  seed: number,
  attempt: number,
  players: readonly AshenCruciblePlayer[],
): AshenCrucibleMap {
  const { height, width } = ASHEN_CRUCIBLE_MAP_SIZE;
  const rng = createMapRng(seed, `ashen_crucible:layout:${attempt}`);
  const spawn: MapPoint = { x: width - SPAWN_EAST_INSET, y: height / 2 };
  const placements = placeCamps(rng, players, spawn);
  const vents = placeCrucibleVents(rng);
  const veins = placeCrucibleVeins(rng, placements, vents, spawn);
  const nodes = placeCrucibleNodes(rng, placements, vents, veins);

  const buildings: BuildingInit[] = placements.map((entry) => ({
    buildingType: "camp",
    completed: true,
    id: `crucible-camp-${entry.player.slotIndex + 1}`,
    ownerId: entry.player.id,
    x: entry.camp.x,
    y: entry.camp.y,
  }));

  const units: UnitInit[] = placements.flatMap((entry) =>
    startingUnitsForPlayer(entry),
  );

  return {
    buildings,
    chokePoints: [
      {
        id: "north-crucible",
        label: "North Crucible",
        x: Math.round(width * 0.44),
        y: Math.round(height * 0.22),
      },
      {
        id: "center-crossing",
        label: "Center Crossing",
        x: Math.round(width * 0.46),
        y: Math.round(height * 0.5),
      },
      {
        id: "south-crucible",
        label: "South Crucible",
        x: Math.round(width * 0.44),
        y: Math.round(height * 0.78),
      },
    ],
    height,
    nodes,
    stockpile: ashenCrucibleStockpile(players.length),
    units,
    veins,
    vents,
    width,
  };
}

/**
 * Places 1–4 player Camps along a western crescent so every player has clear
 * building ground and an open approach toward the central Crucible ridge.
 * @param rng - Layout RNG
 * @param players - Active co-op players
 * @param spawn - Eastern Horde Gate point
 * @returns Camp positions and headings toward the horde
 */
function placeCamps(
  rng: SimRng,
  players: readonly AshenCruciblePlayer[],
  spawn: MapPoint,
): CampPlacement[] {
  const { height } = ASHEN_CRUCIBLE_MAP_SIZE;
  const count = players.length;
  const topY = count === 1 ? height / 2 : 36;
  const bottomY = count === 1 ? height / 2 : height - 36;

  return players.map((player, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const baseY = topY + (bottomY - topY) * t;
    // Slight arc: outer flanks sit a few tiles further east than center camps.
    const arcOffset = Math.abs(t - 0.5) * 14;
    const x = Math.round(18 + arcOffset + randomBetween(rng, -2, 2));
    const y = Math.round(
      clamp(baseY + randomBetween(rng, -4, 4), 26, height - 26),
    );
    const camp = { x, y };
    return {
      camp,
      heading: headingBetween(camp, spawn),
      player,
    };
  });
}

/**
 * Places a staggered central ridge of 5–6 Ember Vents carving three tactical
 * lanes (north, center, south) without walling off any player.
 * @param rng - Layout RNG
 * @returns Vent hazard volumes
 */
function placeCrucibleVents(rng: SimRng): CircleVolume[] {
  const { height, width } = ASHEN_CRUCIBLE_MAP_SIZE;
  const anchors: { x: number; y: number }[] = [
    { x: width * 0.43, y: height * 0.14 },
    { x: width * 0.46, y: height * 0.34 },
    { x: width * 0.46, y: height * 0.66 },
    { x: width * 0.43, y: height * 0.86 },
    { x: width * 0.58, y: height * 0.44 },
    { x: width * 0.58, y: height * 0.56 },
  ];

  return anchors.map((anchor) => {
    const radius = Math.round(randomBetween(rng, 2.25, 3.0) * 4) / 4;
    const point = insideMap(
      {
        x: anchor.x + randomBetween(rng, -3.5, 3.5),
        y: anchor.y + randomBetween(rng, -3.5, 3.5),
      },
      radius + 3,
    );
    return { radius, ...point };
  });
}

/**
 * Places one Spirit Vein near each Camp plus two shared veins along the
 * central Crucible lanes.
 * @param rng - Layout RNG
 * @param placements - Player camp placements
 * @param vents - Placed Ember Vents
 * @param spawn - Eastern Horde Gate point
 * @returns Spirit veins
 */
function placeCrucibleVeins(
  rng: SimRng,
  placements: readonly CampPlacement[],
  vents: readonly CircleVolume[],
  spawn: MapPoint,
): SpiritVein[] {
  const { height, width } = ASHEN_CRUCIBLE_MAP_SIZE;
  const veins: SpiritVein[] = placements.map((entry) => {
    const raw = polarOffset(
      entry.camp,
      entry.heading + randomBetween(rng, -0.3, 0.3),
      randomBetween(rng, 7 + CAMP_EDGE, 9 + CAMP_EDGE),
    );
    return {
      id: `crucible-vein-p${entry.player.slotIndex + 1}`,
      ...clearOfVents(vents, raw, entry.heading),
    };
  });

  const sharedTargets: { id: string; x: number; y: number }[] = [
    {
      id: "crucible-vein-north",
      x: width * 0.52 + randomBetween(rng, -4, 4),
      y: height * 0.3 + randomBetween(rng, -4, 4),
    },
    {
      id: "crucible-vein-south",
      x: width * 0.52 + randomBetween(rng, -4, 4),
      y: height * 0.7 + randomBetween(rng, -4, 4),
    },
    {
      id: "crucible-vein-frontier",
      x: width * 0.7 + randomBetween(rng, -4, 4),
      y: height * 0.5 + randomBetween(rng, -6, 6),
    },
  ];
  for (const target of sharedTargets) {
    veins.push({
      id: target.id,
      ...clearOfVents(vents, target, headingBetween(target, spawn)),
    });
  }
  return veins;
}

/**
 * Places each player's four personal starter deposits around their Camp, then
 * fills the shared mid-field, frontier, and outer deposits using Poisson-disk
 * candidates.
 * @param rng - Layout RNG
 * @param placements - Player camp placements
 * @param vents - Placed vents
 * @param veins - Placed veins
 * @returns All resource nodes on the map
 */
function placeCrucibleNodes(
  rng: SimRng,
  placements: readonly CampPlacement[],
  vents: readonly CircleVolume[],
  veins: readonly SpiritVein[],
): ResourceNode[] {
  const { height, width } = ASHEN_CRUCIBLE_MAP_SIZE;
  const placed: ResourceNode[] = [];
  const taken = new Set<string>();

  const isCellValid = (cell: MapPoint): boolean => {
    if (!onMap(ASHEN_CRUCIBLE_MAP_SIZE, cell)) return false;
    if (taken.has(cellKey(cell))) return false;
    if (nearVent(vents, cell)) return false;
    if (nearestDistance(cell, veins) < VEIN_CLEARANCE) return false;
    for (const entry of placements) {
      if (distance(cell, entry.camp) < BUILD_APRON) return false;
    }
    const inArrival =
      cell.x >= width - SPAWN_CLEARING_COLUMNS &&
      Math.abs(cell.y - height / 2) <= SPAWN_CLEARING_ROWS;
    return !inArrival;
  };

  // 1. Starter deposits around every player's Camp.
  const baseAngles = [-2.2, -0.85, 0.85, 2.2];
  for (const entry of placements) {
    const angleShift = randomBetween(rng, -0.2, 0.2);
    for (
      let index = 0;
      index < ASHEN_CRUCIBLE_STARTER_NODES.length;
      index += 1
    ) {
      const slot = ASHEN_CRUCIBLE_STARTER_NODES[index];
      if (!slot) continue;
      const desiredAngle =
        entry.heading + (baseAngles[index] ?? 0) + angleShift;
      const cell = findNearCampCell(
        entry.camp,
        desiredAngle,
        isCellValid,
        placed,
      );
      taken.add(cellKey(cell));
      placed.push({
        id: `crucible-p${entry.player.slotIndex + 1}-${slot.key}`,
        nodeType: slot.nodeType,
        remaining: slot.remaining,
        resourceId: slot.resourceId,
        ...cell,
      });
    }
  }

  // 2. Shared mid-field, frontier, and outer deposits.
  const candidates = uniqueCells(
    poissonDiskSample(
      rng,
      {
        height: height - EDGE_MARGIN * 2,
        width: width - EDGE_MARGIN * 2,
        x: EDGE_MARGIN,
        y: EDGE_MARGIN,
      },
      CANDIDATE_SPACING,
    ),
  ).filter(isCellValid);

  for (const slot of ASHEN_CRUCIBLE_SHARED_SLOTS) {
    const cell = pickSharedCell(rng, candidates, placed, taken, slot);
    taken.add(cellKey(cell));
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
 * Finds an open cell around a Camp along a preferred bearing.
 * @param camp - Camp center
 * @param angle - Preferred radial direction
 * @param isCellValid - Ground clearance predicate
 * @param placed - Existing nodes for spacing
 * @returns Chosen cell
 */
function findNearCampCell(
  camp: MapPoint,
  angle: number,
  isCellValid: (cell: MapPoint) => boolean,
  placed: readonly ResourceNode[],
): MapPoint {
  const radii = [
    9 + CAMP_EDGE,
    10.5 + CAMP_EDGE,
    12 + CAMP_EDGE,
    8 + CAMP_EDGE,
  ];
  const angleOffsets = [0, 0.2, -0.2, 0.45, -0.45, 0.8, -0.8, 1.2, -1.2];
  for (const radius of radii) {
    for (const delta of angleOffsets) {
      const candidate = insideMap(
        polarOffset(camp, angle + delta, radius),
        EDGE_MARGIN,
      );
      if (!isCellValid(candidate)) continue;
      if (nearestDistance(candidate, placed) < 4) continue;
      return candidate;
    }
  }
  return insideMap(polarOffset(camp, angle, 9 + CAMP_EDGE), EDGE_MARGIN);
}

/**
 * Picks the best available Poisson-disk cell for a shared contested slot.
 * @param rng - Layout RNG
 * @param candidates - Pre-filtered open cells
 * @param placed - Already placed nodes
 * @param taken - Occupied cell keys
 * @param slot - Shared slot specification
 * @returns Chosen cell
 */
function pickSharedCell(
  rng: SimRng,
  candidates: readonly MapPoint[],
  placed: readonly ResourceNode[],
  taken: ReadonlySet<string>,
  slot: AshenCrucibleSharedSlot,
): MapPoint {
  const { height, width } = ASHEN_CRUCIBLE_MAP_SIZE;
  const target: MapPoint = {
    x: slot.targetX * width,
    y: slot.targetY * height,
  };
  const free = candidates.filter((cell) => !taken.has(cellKey(cell)));
  const choice = pickBest(free, (cell) => {
    const spacing = nearestDistance(cell, placed);
    if (spacing < 7) return null;
    return (
      -distance(cell, target) + Math.min(spacing, 14) * 0.4 + rng.next() * 3
    );
  });
  if (choice) return choice;
  const fallback = pickBest(free, (cell) => -distance(cell, target));
  return fallback ?? insideMap(target, EDGE_MARGIN);
}

/**
 * Creates a player's starting Captain Warden and three Villagers beside their Camp.
 * @param entry - Player and camp placement
 * @returns Starting unit records owned by this player
 */
function startingUnitsForPlayer(entry: CampPlacement): UnitInit[] {
  const { camp, heading, player } = entry;
  const slot = player.slotIndex + 1;
  const behind = polarOffset(
    camp,
    heading + Math.PI,
    footprintRadius("camp") + 2,
  );
  return [
    {
      classId: "warden",
      id: `crucible-captain-${slot}`,
      maxHp: 140,
      ownerId: player.id,
      popKind: "soldier",
      realmId: "qi_gathering",
      ...insideMap(polarOffset(camp, heading, footprintRadius("camp") + 2), 2),
    },
    ...Array.from(
      { length: ASHEN_CRUCIBLE_STARTING_VILLAGERS },
      (_, index): UnitInit => ({
        id: `crucible-villager-${slot}-${index + 1}`,
        ownerId: player.id,
        ...insideMap(
          polarOffset(behind, heading + Math.PI / 2, (index - 1) * 2),
          2,
        ),
      }),
    ),
  ];
}

function clearOfVents(
  vents: readonly CircleVolume[],
  point: MapPoint,
  heading: number,
): MapPoint {
  let cell = insideMap(point, EDGE_MARGIN);
  for (let step = 0; step < 12 && nearVent(vents, cell); step += 1) {
    cell = insideMap(polarOffset(cell, heading, 2), EDGE_MARGIN);
  }
  return cell;
}

function nearVent(vents: readonly CircleVolume[], cell: MapPoint): boolean {
  return vents.some(
    (vent) => distance(vent, cell) < vent.radius + VENT_CLEARANCE,
  );
}

function insideAnyVent(
  vents: readonly CircleVolume[],
  cell: MapPoint,
): boolean {
  return vents.some((vent) => distance(vent, cell) <= vent.radius + 0.05);
}

function insideMap(point: MapPoint, margin: number): MapPoint {
  const { height, width } = ASHEN_CRUCIBLE_MAP_SIZE;
  return toCell({
    x: clamp(point.x, margin, width - 1 - margin),
    y: clamp(point.y, margin, height - 1 - margin),
  });
}

function onMap(
  map: { height: number; width: number },
  cell: MapPoint,
): boolean {
  return (
    cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height
  );
}

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

function cellKey(cell: MapPoint): string {
  return `${cell.x},${cell.y}`;
}
