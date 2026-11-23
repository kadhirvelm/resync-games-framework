import {
  type MapPoint,
  type OrderBuilding,
  type OrderNode,
  type OrderUnit,
  ordersForRightClick,
} from "./selection";

/** The command represented by the pointer over the battlefield. */
export type CommandCursorKind =
  | "attack"
  | "build"
  | "gather"
  | "mineral"
  | "move"
  | "wood";

/** Resource marker fields needed to choose a gathering tool. */
export interface CommandCursorNode extends OrderNode {
  resource: string;
}

/** Building fields needed to decide whether construction or repair is offered. */
export interface CommandCursorBuilding extends OrderBuilding {
  built?: boolean;
  constructing?: boolean;
  hitPoints?: number | null;
  hp?: number | null;
  maxHitPoints?: number | null;
  maxHp?: number | null;
}

/** Hovered targets and selected actors used by the right-click rules. */
export interface CommandCursorInput {
  buildings: readonly CommandCursorBuilding[];
  ground: MapPoint | null;
  localPlayerId?: string;
  nodes: readonly CommandCursorNode[];
  /** Building placement always uses the hammer, even over another target. */
  placing: boolean;
  selectedIds: readonly string[];
  targetBuildingId: string | null;
  targetUnitId: string | null;
  units: readonly OrderUnit[];
}

const WOOD_RESOURCES = new Set(["tree", "trees", "wood"]);
const MINERAL_RESOURCES = new Set([
  "coin",
  "essence",
  "gold",
  "iron",
  "ore",
  "stone",
]);

/**
 * Reports whether a Hold building still needs construction or repair.
 * Minimal test fixtures that omit both completion and health metadata default
 * to true so they continue showing the build cursor.
 * @param building - Targeted Hold building
 * @returns True when under construction, damaged, or metadata is absent
 */
function needsBuildOrRepair(
  building: CommandCursorBuilding | undefined,
): boolean {
  if (building === undefined) return false;
  if (building.constructing === true || building.built === false) return true;
  const hp = building.hitPoints ?? building.hp ?? null;
  const maxHp = building.maxHitPoints ?? building.maxHp ?? null;
  if (hp !== null && maxHp !== null && hp < maxHp) return true;
  const hasCompletionInfo =
    building.constructing !== undefined || building.built !== undefined;
  const hasHealthInfo = hp !== null && maxHp !== null;
  if (!hasCompletionInfo && !hasHealthInfo) return true;
  return false;
}

/**
 * Resolves the same legal order as a right-click and describes its cursor.
 * Illegal or empty-selection interactions retain the ordinary move cursor.
 * @param input - Current selection, hovered target, and placement state
 * @returns Attack, gathering, building, or default-move cursor kind
 */
export function commandCursorKind(
  input: CommandCursorInput,
): CommandCursorKind {
  if (input.placing) return "build";
  if (input.ground === null) return "move";
  const orders = ordersForRightClick({
    buildings: input.buildings,
    ground: input.ground,
    localPlayerId: input.localPlayerId,
    nodes: input.nodes,
    selectedIds: input.selectedIds,
    targetBuildingId: input.targetBuildingId,
    targetUnitId: input.targetUnitId,
    units: input.units,
  });
  if (orders.some((order) => order.type === "order_attack")) return "attack";
  const build = orders.find((order) => order.type === "assign_build");
  if (build !== undefined && build.type === "assign_build") {
    const target = input.buildings.find(
      (building) => building.id === build.buildingId,
    );
    return needsBuildOrRepair(target) ? "build" : "move";
  }
  const gather = orders.find((order) => order.type === "assign_gather");
  if (gather === undefined || gather.type !== "assign_gather") return "move";
  const resource = input.nodes
    .find((node) => node.id === gather.nodeId)
    ?.resource.toLowerCase();
  if (resource !== undefined && WOOD_RESOURCES.has(resource)) return "wood";
  if (resource !== undefined && MINERAL_RESOURCES.has(resource)) {
    return "mineral";
  }
  return "gather";
}

/**
 * Maps the current command context to a canvas-compatible CSS cursor.
 * @param input - Current selection, hovered target, and placement state
 * @returns SVG data URI cursor with a default fallback, or `default` for move
 */
export function commandCursorFor(input: CommandCursorInput): string {
  const kind = commandCursorKind(input);
  if (kind === "move") return "default";
  return COMMAND_CURSORS[kind];
}

/**
 * Builds one 32-pixel cursor with a dark outline readable over bright lava.
 * @param paths - SVG shapes that make up the command tool
 * @returns CSS image cursor with a top-left hotspot and default fallback
 */
function svgCursor(paths: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="#f2c879" stroke="#211710" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 3, default`;
}

const COMMAND_CURSORS = {
  attack: svgCursor(
    '<path d="M3 3 23 23l-4 1-3 4L3 3Z" fill="#e8edf0"/><path d="m12 22 6-6M15 25l-4-4M18 28l-5-5"/>',
  ),
  build: svgCursor(
    '<path d="m5 5 7-2 6 6-4 4-6-6-3 2Z" fill="#d7dde0"/><path d="m13 13 12 12-4 4L9 17Z"/><path d="m7 8 5-5"/>',
  ),
  gather: svgCursor(
    '<path d="M5 17C5 8 13 4 22 6c-6 2-10 6-10 12l-3 1Z" fill="#d7dde0"/><path d="m14 17 11 10-3 3-11-10Z"/>',
  ),
  mineral: svgCursor(
    '<path d="M4 9q10-11 23 1l-3 3Q15 4 7 13Z" fill="#d7dde0"/><path d="m16 8 9 19-4 2-9-19Z"/>',
  ),
  wood: svgCursor(
    '<path d="M4 4q10 0 14 8l-8 5Q4 12 4 4Z" fill="#d7dde0"/><path d="m13 14 13 13-4 3L9 17Z"/><path d="M4 4q4 8 11 9"/>',
  ),
} as const;
