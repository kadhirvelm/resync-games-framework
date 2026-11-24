import type { Command, ResourceId } from "../logic/types";

/** A point in sim map space. */
export interface MapPoint {
  x: number;
  y: number;
}

/** Units and the one building the player has selected. Selection is UI state. */
export interface Selection {
  buildingId: string | null;
  unitIds: readonly string[];
}

/** An empty selection. */
export const EMPTY_SELECTION: Selection = { buildingId: null, unitIds: [] };

/** Drag rectangle in map space. */
export interface SelectionBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Camera offset in screen pixels. */
export interface Camera {
  x: number;
  y: number;
}

/** Fields the order helper needs from a unit. */
export interface OrderUnit {
  /** Cache/resource currently being hauled, if any. */
  carrying?: { amount: number; resource: ResourceId } | null;
  classId: string;
  factionId: "hold" | "horde";
  id: string;
  /** Owning player id in multiplayer matches; omitted in solo play. */
  ownerId?: string;
  x: number;
  y: number;
}

/** Fields the order helper needs from a building. */
export interface OrderBuilding {
  /** Stable building type used to recognize cache drop-offs. */
  buildingType?: string;
  factionId: "hold" | "horde";
  id: string;
  /** Owning player id in multiplayer matches; omitted in solo play. */
  ownerId?: string;
}

/**
 * Checks whether a unit or building is controllable by the local player.
 * In solo play (`localPlayerId === undefined`), every Hold entity is controllable.
 * @param entity - Unit or building to test
 * @param localPlayerId - Local player id in multiplayer, or undefined in solo
 * @returns Whether the local player owns or controls this entity
 */
export function isLocalPlayerOwned(
  entity: { ownerId?: string },
  localPlayerId?: string,
): boolean {
  if (localPlayerId === undefined) return true;
  return entity.ownerId === localPlayerId;
}

/** Fields the order helper needs from a resource node. */
export interface OrderNode {
  /** Identifies a one-time guarded cache eligible for villager and Qi hauling. */
  explorationCacheId?: string;
  id: string;
  x: number;
  y: number;
}

/** How close, in map cells, a right-click must land to target a node. */
export const NODE_CLICK_RADIUS = 1.6;

/**
 * Snaps a map point to the building grid. Placement, veins, and occupancy
 * all use whole cells.
 * @param point - Continuous map point
 * @returns The nearest cell
 */
export function snapMapCell(point: MapPoint): MapPoint {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

/**
 * Converts a pointer position into map space.
 * @param clientX - Pointer x in the viewport
 * @param clientY - Pointer y in the viewport
 * @param rect - Map viewport rectangle
 * @param camera - Current camera offset in pixels
 * @param scale - Pixels per map unit
 * @returns The map point under the pointer
 */
export function clientToWorld(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  camera: Camera,
  scale: number,
): MapPoint {
  if (!(scale > 0)) return { x: 0, y: 0 };
  return {
    x: (clientX - rect.left + camera.x) / scale,
    y: (clientY - rect.top + camera.y) / scale,
  };
}

/**
 * Hold units whose centers lie in a drag box. In multiplayer, only returns
 * units owned by `localPlayerId`.
 * @param units - Units on the map
 * @param box - Drag rectangle in map space
 * @param localPlayerId - Local player id in multiplayer
 * @returns Ids of controllable Hold units inside the box
 */
export function unitsInBox(
  units: readonly OrderUnit[],
  box: SelectionBox,
  localPlayerId?: string,
): string[] {
  const left = Math.min(box.x0, box.x1);
  const right = Math.max(box.x0, box.x1);
  const top = Math.min(box.y0, box.y1);
  const bottom = Math.max(box.y0, box.y1);
  return units
    .filter(
      (unit) =>
        unit.factionId === "hold" && isLocalPlayerOwned(unit, localPlayerId),
    )
    .filter(
      (unit) =>
        unit.x >= left && unit.x <= right && unit.y >= top && unit.y <= bottom,
    )
    .map((unit) => unit.id);
}

/**
 * Drops selected ids that the latest snapshot no longer contains.
 * @param selection - Current UI selection
 * @param ids - Ids still present on the snapshot
 * @returns The same selection, or a pruned copy
 */
export function pruneSelection(
  selection: Selection,
  ids: {
    buildings: readonly { id: string }[];
    units: readonly { id: string }[];
  },
): Selection {
  const unitIds = selection.unitIds.filter((id) =>
    ids.units.some((unit) => unit.id === id),
  );
  const buildingStillThere = ids.buildings.some(
    (building) => building.id === selection.buildingId,
  );
  const buildingId = buildingStillThere ? selection.buildingId : null;
  if (
    unitIds.length === selection.unitIds.length &&
    buildingId === selection.buildingId
  ) {
    return selection;
  }
  return { buildingId, unitIds };
}

/**
 * Applies a click or drag to the selection. When `units` is supplied, Hold and
 * Horde units are kept separate so shift-clicking never mixes enemies into a
 * friendly selection (friendly Hold units take precedence).
 * @param selection - Current selection
 * @param unitIds - Units the gesture hit
 * @param mode - Replace, add, or toggle membership
 * @param units - Optional unit roster with faction ids to prevent faction mixing
 * @returns The next selection, with any building cleared
 */
export function nextUnitSelection(
  selection: Selection,
  unitIds: readonly string[],
  mode: "add" | "replace" | "toggle",
  units?: readonly Pick<OrderUnit, "factionId" | "id">[],
): Selection {
  if (units === undefined) {
    return applyUnitSelectionMode(selection, unitIds, mode);
  }
  const factionById = new Map(units.map((unit) => [unit.id, unit.factionId]));
  const incomingHold = unitIds.filter((id) => factionById.get(id) === "hold");
  const incomingHorde = unitIds.filter((id) => factionById.get(id) === "horde");
  if (mode === "replace") {
    const cleaned = incomingHold.length > 0 ? incomingHold : unitIds;
    return { buildingId: null, unitIds: [...cleaned] };
  }
  const existingHasHold = selection.unitIds.some(
    (id) => factionById.get(id) === "hold",
  );
  const existingHasHorde = selection.unitIds.some(
    (id) => factionById.get(id) === "horde",
  );
  if (incomingHold.length > 0) {
    const base = existingHasHorde
      ? {
          buildingId: null,
          unitIds: selection.unitIds.filter(
            (id) => factionById.get(id) !== "horde",
          ),
        }
      : selection;
    return applyUnitSelectionMode(base, incomingHold, mode);
  }
  if (incomingHorde.length > 0 && existingHasHold) {
    return { buildingId: null, unitIds: [...selection.unitIds] };
  }
  return applyUnitSelectionMode(selection, unitIds, mode);
}

/**
 * Applies replace, add, or toggle membership without faction filtering.
 * @param selection - Current selection
 * @param unitIds - Incoming unit ids
 * @param mode - Selection update mode
 * @returns Updated selection with building cleared
 */
function applyUnitSelectionMode(
  selection: Selection,
  unitIds: readonly string[],
  mode: "add" | "replace" | "toggle",
): Selection {
  if (mode === "replace") return { buildingId: null, unitIds: [...unitIds] };
  if (mode === "add") {
    const merged = new Set([...selection.unitIds, ...unitIds]);
    return { buildingId: null, unitIds: [...merged] };
  }
  const merged = [...selection.unitIds];
  for (const id of unitIds) {
    const index = merged.indexOf(id);
    if (index === -1) merged.push(id);
    else merged.splice(index, 1);
  }
  return { buildingId: null, unitIds: merged };
}

/**
 * Whether a map point sits on a published Spirit Vein.
 * @param veins - Vein markers and their published radii
 * @param point - Cursor in map space
 * @returns Whether the cursor is inside a vein
 */
export function veinUnderCursor(
  veins: readonly { radius: number; x: number; y: number }[],
  point: MapPoint,
): boolean {
  return veins.some((vein) => {
    const dx = vein.x - point.x;
    const dy = vein.y - point.y;
    return dx * dx + dy * dy <= vein.radius * vein.radius;
  });
}

/**
 * The resource node nearest a map point, if one is close enough to click.
 * @param nodes - Nodes on the map
 * @param point - Cursor in map space
 * @param radius - Largest distance that still counts as a hit
 * @returns The node under the cursor, or null
 */
export function nodeNear<Node extends OrderNode>(
  nodes: readonly Node[],
  point: MapPoint,
  radius = NODE_CLICK_RADIUS,
): Node | null {
  let best: Node | null = null;
  let bestDistance = radius;
  for (const node of nodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y);
    if (distance > bestDistance) continue;
    best = node;
    bestDistance = distance;
  }
  return best;
}

/**
 * Turns a right-click into commands, the way an RTS reads it. Soldiers attack
 * enemies and move everywhere else. Villagers gather a node, build or repair
 * a Hold building, and move on open ground; they ignore enemies. With Shift
 * held, moves are queued behind the units' current legs.
 * @param input - Selection, what was under the cursor, the ground point, and
 *   whether Shift queues the move
 * @returns Commands to enqueue, empty when nothing selected can act
 */
export function ordersForRightClick(input: {
  buildings: readonly OrderBuilding[];
  ground: MapPoint;
  localPlayerId?: string;
  nodes: readonly OrderNode[];
  /** Shift-click: queue moves as waypoints instead of replacing orders. */
  queue?: boolean;
  selectedIds: readonly string[];
  targetBuildingId: string | null;
  targetUnitId: string | null;
  units: readonly OrderUnit[];
}): Command[] {
  const selected = new Set(input.selectedIds);
  const actors = input.units.filter(
    (unit) =>
      selected.has(unit.id) &&
      unit.factionId === "hold" &&
      isLocalPlayerOwned(unit, input.localPlayerId),
  );
  if (actors.length === 0) return [];
  const villagerIds = actors
    .filter((unit) => unit.classId === "villager")
    .map((unit) => unit.id);
  const soldierIds = actors
    .filter((unit) => unit.classId !== "villager")
    .map((unit) => unit.id);
  const enemyId = enemyTarget(input);
  if (enemyId !== null) {
    if (soldierIds.length === 0) return [];
    return [{ targetId: enemyId, type: "order_attack", unitIds: soldierIds }];
  }
  const villagerOrder = villagerTarget(input, villagerIds, actors);
  const queue = input.queue === true ? { queue: true } : {};
  if (villagerOrder === null) {
    return [
      {
        type: "order_move",
        unitIds: actors.map((unit) => unit.id),
        ...queue,
        ...groundPoint(input.ground),
      },
    ];
  }
  const cache = nodeNear(input.nodes, input.ground);
  const movementIds =
    cache?.explorationCacheId === undefined
      ? soldierIds
      : actors
          .filter((unit) => !isExplorationCarrierClass(unit.classId))
          .map((unit) => unit.id);
  if (movementIds.length === 0) return [villagerOrder];
  return [
    villagerOrder,
    {
      type: "order_move",
      unitIds: movementIds,
      ...queue,
      ...groundPoint(input.ground),
    },
  ];
}

/**
 * Builds attack-move commands for the current selection. Locally owned
 * military units receive `order_attack_move`; locally owned villagers in a
 * mixed selection receive `order_move` toward the same destination.
 * @param model - Model slice containing the current units
 * @param selectedIds - Currently selected unit ids
 * @param point - Destination in map space
 * @param queue - Whether to append as a Shift-queued waypoint
 * @param localOwnerId - Local player id in multiplayer, or undefined in solo
 * @returns Commands to enqueue, empty when no controllable Hold unit is selected
 */
export function ordersForAttackMove(
  model: { units: readonly OrderUnit[] },
  selectedIds: readonly string[],
  point: MapPoint,
  queue = false,
  localOwnerId?: string,
): Command[] {
  const selected = new Set(selectedIds);
  const actors = model.units.filter(
    (unit) =>
      selected.has(unit.id) &&
      unit.factionId === "hold" &&
      isLocalPlayerOwned(unit, localOwnerId),
  );
  if (actors.length === 0) return [];
  const soldierIds = actors
    .filter((unit) => unit.classId !== "villager")
    .map((unit) => unit.id);
  const villagerIds = actors
    .filter((unit) => unit.classId === "villager")
    .map((unit) => unit.id);
  const queueField = queue ? { queue: true } : {};
  const destination = groundPoint(point);
  const commands: Command[] = [];
  if (soldierIds.length > 0) {
    commands.push({
      type: "order_attack_move",
      unitIds: soldierIds,
      ...queueField,
      ...destination,
    });
  }
  if (villagerIds.length > 0) {
    commands.push({
      type: "order_move",
      unitIds: villagerIds,
      ...queueField,
      ...destination,
    });
  }
  return commands;
}

/**
 * @param point - Ground point
 * @returns The x and y fields of a move order
 */
function groundPoint(point: MapPoint): MapPoint {
  return { x: point.x, y: point.y };
}

/**
 * @param input - Right-click targets
 * @returns The horde unit or building under the cursor, or null
 */
function enemyTarget(input: {
  buildings: readonly OrderBuilding[];
  targetBuildingId: string | null;
  targetUnitId: string | null;
  units: readonly OrderUnit[];
}): string | null {
  const unit = input.units.find((entry) => entry.id === input.targetUnitId);
  if (unit !== undefined && unit.factionId === "horde") return unit.id;
  const building = input.buildings.find(
    (entry) => entry.id === input.targetBuildingId,
  );
  if (building !== undefined && building.factionId === "horde") {
    return building.id;
  }
  return null;
}

/**
/**
 * Checks whether a class may haul exploration caches.
 * @param classId - Unit class id
 * @returns True for villagers and Qi cultivator classes
 */
function isExplorationCarrierClass(classId: OrderUnit["classId"]): boolean {
  return (
    classId === "villager" ||
    classId === "cultivator" ||
    classId === "sword_sage" ||
    classId === "formation_master"
  );
}

/**
 * The job a right-click offers villagers: a Hold building to build, repair,
 * or deposit at, or a resource node to gather. Qi cultivators may haul caches.
 * @param input - Right-click targets
 * @param villagerIds - Selected villagers
 * @param actors - Full selected Hold roster, including possible Qi carriers
 * @returns A gather/build command, or null when the click is plain ground
 */
function villagerTarget(
  input: {
    buildings: readonly OrderBuilding[];
    ground: MapPoint;
    nodes: readonly OrderNode[];
    targetBuildingId: string | null;
  },
  villagerIds: string[],
  actors: readonly OrderUnit[],
): Command | null {
  const building = input.buildings.find(
    (entry) => entry.id === input.targetBuildingId,
  );
  if (building !== undefined && building.factionId === "hold") {
    const cacheCarrierIds = actors
      .filter(
        (unit) =>
          unit.carrying !== null &&
          unit.carrying !== undefined &&
          isExplorationCarrierClass(unit.classId),
      )
      .map((unit) => unit.id);
    const isDropOff =
      building.buildingType === "camp" ||
      building.buildingType === "storehouse";
    if (cacheCarrierIds.length > 0 && isDropOff) {
      return {
        buildingId: building.id,
        type: "assign_build",
        unitIds: [...villagerIds, ...cacheCarrierIds],
      };
    }
    if (villagerIds.length === 0) return null;
    return {
      buildingId: building.id,
      type: "assign_build",
      unitIds: villagerIds,
    };
  }
  const node = nodeNear(input.nodes, input.ground);
  if (node === null) return null;
  if (node.explorationCacheId !== undefined) {
    const carrierIds = actors
      .filter((unit) => isExplorationCarrierClass(unit.classId))
      .map((unit) => unit.id);
    if (carrierIds.length > 0) {
      return { nodeId: node.id, type: "assign_gather", unitIds: carrierIds };
    }
  }
  if (villagerIds.length === 0) return null;
  return { nodeId: node.id, type: "assign_gather", unitIds: villagerIds };
}

/**
 * Villagers waiting for orders, in a stable order.
 * @param units - Units on the map
 * @returns Idle villager ids
 */
export function idleVillagerIds(
  units: readonly {
    factionId: string;
    id: string;
    idle: boolean;
    ownerId?: string;
  }[],
  localPlayerId?: string,
): string[] {
  return units
    .filter(
      (unit) =>
        unit.factionId === "hold" &&
        unit.idle &&
        isLocalPlayerOwned(unit, localPlayerId),
    )
    .map((unit) => unit.id)
    .sort();
}

/**
 * Picks the next idle villager after the one already selected, wrapping.
 * @param idleIds - Idle villager ids from `idleVillagerIds`
 * @param selection - Current selection
 * @returns The id to select, or null when no villager is idle
 */
export function nextIdleVillager(
  idleIds: readonly string[],
  selection: Selection,
): string | null {
  if (idleIds.length === 0) return null;
  const current =
    selection.unitIds.length === 1 ? (selection.unitIds[0] ?? null) : null;
  const index = current === null ? -1 : idleIds.indexOf(current);
  return idleIds[(index + 1) % idleIds.length] ?? null;
}

/** Most idle villagers drafted when a site is placed with none selected. */
export const DRAFTED_BUILDERS = 1;

/**
 * Villagers who build a newly placed site: the selected villagers, or up to
 * `DRAFTED_BUILDERS` idle villagers when none are selected.
 * @param units - Units on the map
 * @param selection - Current selection
 * @returns Builder ids, possibly empty
 */
export function placementBuilders(
  units: readonly {
    classId: string;
    factionId: string;
    id: string;
    idle: boolean;
    ownerId?: string;
  }[],
  selection: Selection,
  localPlayerId?: string,
): string[] {
  const selected = units
    .filter(
      (unit) =>
        selection.unitIds.includes(unit.id) &&
        unit.factionId === "hold" &&
        isLocalPlayerOwned(unit, localPlayerId) &&
        unit.classId === "villager",
    )
    .map((unit) => unit.id);
  if (selected.length > 0) return selected;
  return idleVillagerIds(units, localPlayerId).slice(0, DRAFTED_BUILDERS);
}

/**
 * Builds a rally command, snapping it onto a resource node when the point
 * lands on one so trained villagers start gathering there.
 * @param buildingId - Camp or Barracks being rallied
 * @param point - Map point the player chose
 * @param nodes - Resource nodes on the map
 * @returns The `set_rally_point` command
 */
export function rallyCommand(
  buildingId: string,
  point: MapPoint,
  nodes: readonly OrderNode[],
): Extract<Command, { type: "set_rally_point" }> {
  const node = nodeNear(nodes, point);
  if (node === null) {
    return { buildingId, type: "set_rally_point", x: point.x, y: point.y };
  }
  return {
    buildingId,
    nodeId: node.id,
    type: "set_rally_point",
    x: node.x,
    y: node.y,
  };
}

/** How a right-click order is acknowledged on the battlefield. */
export type OrderMarkerKind = "attack" | "build" | "gather" | "move";

/** Where and how to show the acknowledgement for a right-click order. */
export interface OrderMarker {
  kind: OrderMarkerKind;
  point: MapPoint;
}

/**
 * Chooses the ground marker for a right-click, so the player sees where the
 * selection was sent. Gather and build markers sit on the node or building,
 * attack markers on the target, and move markers where the click landed.
 * @param input - Orders the click produced and what they can refer to
 * @returns The marker, or null when the click produced no order
 */
export function orderMarkerFor(input: {
  buildings: readonly { id: string; x: number; y: number }[];
  ground: MapPoint;
  nodes: readonly OrderNode[];
  orders: readonly Command[];
  units: readonly { id: string; x: number; y: number }[];
}): OrderMarker | null {
  const [first] = input.orders;
  if (first === undefined) return null;
  if (first.type === "order_attack") {
    const target =
      input.units.find((unit) => unit.id === first.targetId) ??
      input.buildings.find((building) => building.id === first.targetId);
    return { kind: "attack", point: pointOf(target, input.ground) };
  }
  if (first.type === "assign_gather") {
    const node = input.nodes.find((entry) => entry.id === first.nodeId);
    return { kind: "gather", point: pointOf(node, input.ground) };
  }
  if (first.type === "assign_build") {
    const building = input.buildings.find(
      (entry) => entry.id === first.buildingId,
    );
    return { kind: "build", point: pointOf(building, input.ground) };
  }
  return { kind: "move", point: { x: input.ground.x, y: input.ground.y } };
}

/**
 * @param target - Entity an order refers to, if it is still on the map
 * @param fallback - Point to use when it is not
 * @returns The entity's position, or the fallback
 */
function pointOf(
  target: { x: number; y: number } | undefined,
  fallback: MapPoint,
): MapPoint {
  if (target === undefined) return { x: fallback.x, y: fallback.y };
  return { x: target.x, y: target.y };
}

/**
 * The units a double-click selects, the way an RTS reads it: every Hold unit
 * of the clicked unit's class that is on screen. Double-clicking an enemy
 * keeps just that enemy.
 * @param units - Units on the map
 * @param clickedId - Unit under the double-click
 * @param visibleIds - Units currently on screen
 * @returns Ids to select, the clicked unit first; empty if it is gone
 */
export function similarVisibleUnitIds(
  units: readonly {
    classId: string;
    factionId: string;
    id: string;
    ownerId?: string;
  }[],
  clickedId: string,
  visibleIds: readonly string[],
  localPlayerId?: string,
): string[] {
  const clicked = units.find((unit) => unit.id === clickedId);
  if (clicked === undefined) return [];
  if (
    clicked.factionId !== "hold" ||
    !isLocalPlayerOwned(clicked, localPlayerId)
  ) {
    return [clicked.id];
  }
  const visible = new Set(visibleIds);
  const others = units
    .filter(
      (unit) =>
        unit.id !== clicked.id &&
        unit.factionId === "hold" &&
        isLocalPlayerOwned(unit, localPlayerId) &&
        unit.classId === clicked.classId &&
        visible.has(unit.id),
    )
    .map((unit) => unit.id);
  return [clicked.id, ...others];
}

/** Selected units that share a faction and class, shown as one icon. */
export interface SelectionGroup<ClassName extends string = string> {
  classId: ClassName;
  factionId: "hold" | "horde";
  /** Stable key: faction and class. */
  key: string;
  /** Group members, in selection order. */
  unitIds: string[];
}

/**
 * Splits a selection into groups by faction and class, in the order each
 * group first appears in the selection. Hold groups come before Horde groups.
 * @param units - Units on the map
 * @param unitIds - Selected unit ids
 * @returns One group per faction and class; empty when nothing is selected
 */
export function selectionGroups<ClassName extends string>(
  units: readonly {
    classId: ClassName;
    factionId: "hold" | "horde";
    id: string;
  }[],
  unitIds: readonly string[],
): SelectionGroup<ClassName>[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const groups = new Map<string, SelectionGroup<ClassName>>();
  for (const id of unitIds) {
    const unit = byId.get(id);
    if (unit === undefined) continue;
    const key = `${unit.factionId}:${unit.classId}`;
    const group = groups.get(key);
    if (group !== undefined) {
      group.unitIds.push(id);
      continue;
    }
    groups.set(key, {
      classId: unit.classId,
      factionId: unit.factionId,
      key,
      unitIds: [id],
    });
  }
  const ordered = [...groups.values()];
  return [
    ...ordered.filter((group) => group.factionId === "hold"),
    ...ordered.filter((group) => group.factionId === "horde"),
  ];
}
