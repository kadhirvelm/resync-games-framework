import type { AshenGateSceneryRole } from "../data/layers/ashen_gate/threeDAssets";

/** World units of plateau rock past each edge of the playable map. */
export const PLATEAU_RIM = 7;

/** How far the cliffs drop from the plateau to the lava sea. */
export const ABYSS_DEPTH = 18;

/** World units covered by one repeat of the painted ground texture. */
export const GROUND_TILE_SIZE = 22;

/** World units covered by one repeat of the painted lava texture. */
export const LAVA_TILE_SIZE = 34;

/** One distant spire standing in the lava sea outside the plateau. */
export interface AshenBackdropPiece {
  height: number;
  kind: "mound" | "spire";
  radius: number;
  x: number;
  z: number;
}

/** One generated scenery model placed in world space. */
export interface AshenSceneryPlacement {
  /** Largest x/z span the model is scaled to fit. */
  footprint: number;
  /** Largest height the model is scaled to fit. */
  height: number;
  id: string;
  role: AshenGateSceneryRole;
  /** Turn around the vertical axis, in radians. */
  rotation: number;
  x: number;
  /** Vertical offset of the model's base. */
  y: number;
  z: number;
}

/**
 * Deterministic 0–1 value for a placement index, so scenery never moves
 * between loads.
 * @param index - Placement index
 * @param salt - Separates independent sequences
 * @returns A repeatable pseudo-random fraction
 */
function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Places a ring of spires and low rock in the lava sea around the plateau.
 * Positions are fixed so the horizon does not change between loads.
 * @param mapWidth - Playable ground width
 * @param mapHeight - Playable ground height
 * @returns Rocks in world space, all beyond the plateau rim
 */
export function ashenBackdropPieces(
  mapWidth: number,
  mapHeight: number,
): AshenBackdropPiece[] {
  const centerX = mapWidth / 2;
  const centerZ = mapHeight / 2;
  const count = 18;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + 0.35;
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    // Distance from the centre to the plateau edge along this direction.
    const toEdge = Math.min(
      (mapWidth / 2 + PLATEAU_RIM) / Math.max(1e-6, Math.abs(directionX)),
      (mapHeight / 2 + PLATEAU_RIM) / Math.max(1e-6, Math.abs(directionZ)),
    );
    const reach = toEdge + 10 + hash(index, 1) * 22;
    const spire = index % 3 !== 2;
    return {
      height: spire ? 16 + hash(index, 2) * 14 : 4 + hash(index, 3) * 3,
      kind: spire ? "spire" : "mound",
      radius: spire ? 2.4 + hash(index, 4) * 1.6 : 5 + hash(index, 5) * 3,
      x: centerX + directionX * reach,
      z: centerZ + directionZ * reach,
    };
  });
}

/**
 * Lays out generated scenery: the Horde Gate where raiders enter on the
 * east rim, ruins and boulders along the other rims, spirit crystals
 * between them, and spires rising from the lava. Nothing lands inside the
 * playable map, so scenery never hides a unit or blocks a click.
 * @param mapWidth - Playable ground width
 * @param mapHeight - Playable ground height
 * @returns Fixed world-space placements
 */
export function ashenSceneryPlacements(
  mapWidth: number,
  mapHeight: number,
): AshenSceneryPlacement[] {
  const rimMiddle = PLATEAU_RIM * 0.55;
  const placements: AshenSceneryPlacement[] = [
    {
      footprint: 11,
      height: 12,
      id: "horde-gate",
      role: "hordeGate",
      // Turn the portal's front toward the battlefield in the west.
      rotation: -Math.PI / 2,
      x: mapWidth + rimMiddle,
      y: 0,
      z: mapHeight / 2,
    },
  ];

  const rimRoles: readonly AshenGateSceneryRole[] = [
    "rimRuin",
    "basaltBoulders",
    "spiritCrystals",
    "basaltBoulders",
  ];
  const sizes: Record<string, { footprint: number; height: number }> = {
    basaltBoulders: { footprint: 4.2, height: 2.6 },
    rimRuin: { footprint: 3.6, height: 6.5 },
    spiritCrystals: { footprint: 3.4, height: 4.2 },
  };
  const rimSpacing = 11;
  const addEdge = (
    edge: "east" | "north" | "south" | "west",
    length: number,
    pointAt: (along: number, inset: number) => { x: number; z: number },
    keepClear?: { from: number; to: number },
  ): void => {
    const count = Math.max(2, Math.floor(length / rimSpacing));
    for (let index = 0; index < count; index += 1) {
      const seed = placements.length + index * 7 + edge.length;
      const role = rimRoles[(index + edge.length) % rimRoles.length];
      if (role === undefined) continue;
      const size = sizes[role] ?? { footprint: 3, height: 3 };
      const jitter = (hash(seed, 6) - 0.5) * rimSpacing * 0.5;
      const along = ((index + 0.5) / count) * length + jitter;
      if (keepClear && along > keepClear.from && along < keepClear.to) {
        continue;
      }
      const inset = rimMiddle + (hash(seed, 7) - 0.5) * PLATEAU_RIM * 0.35;
      const point = pointAt(Math.min(length, Math.max(0, along)), inset);
      placements.push({
        footprint: size.footprint * (0.85 + hash(seed, 8) * 0.3),
        height: size.height * (0.85 + hash(seed, 9) * 0.3),
        id: `rim-${edge}-${index}`,
        role,
        rotation: hash(seed, 10) * Math.PI * 2,
        x: point.x,
        y: 0,
        z: point.z,
      });
    }
  };
  addEdge("north", mapWidth, (along, inset) => ({
    x: along,
    z: mapHeight + inset,
  }));
  addEdge("south", mapWidth, (along, inset) => ({ x: along, z: -inset }));
  addEdge("west", mapHeight, (along, inset) => ({ x: -inset, z: along }));
  // Leave the approach to the Horde Gate open on the east rim.
  addEdge(
    "east",
    mapHeight,
    (along, inset) => ({ x: mapWidth + inset, z: along }),
    { from: mapHeight / 2 - 12, to: mapHeight / 2 + 12 },
  );

  for (const [index, piece] of ashenBackdropPieces(
    mapWidth,
    mapHeight,
  ).entries()) {
    if (piece.kind !== "spire") continue;
    placements.push({
      footprint: piece.radius * 2.6,
      height: piece.height + 6,
      id: `abyss-spire-${index}`,
      role: "abyssSpire",
      rotation: hash(index, 11) * Math.PI * 2,
      x: piece.x,
      y: -ABYSS_DEPTH,
      z: piece.z,
    });
  }
  return placements;
}
