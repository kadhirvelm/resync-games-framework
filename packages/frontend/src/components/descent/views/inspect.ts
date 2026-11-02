import { listBuildingDefs } from "../logic/economy/tables";
import type { ResourceId } from "../logic/types";
import { UNIT_TRAINING_GUIDES } from "./card";
import { type MapPoint, nodeNear, type Selection } from "./selection";
import type { ShellBuilding, ShellModel, ShellUnit } from "./shellModel";
import {
  CLASS_LABEL,
  formatChance,
  RESOURCE_COPY,
  type ResourceSelectionId,
  resourceIconSrc,
  resourceSelectionCopy,
  schoolName,
} from "./text";

/**
 * A map feature or stockpile entry the player is inspecting. Units and
 * buildings live in `Selection`; this covers everything else that can be
 * clicked for details.
 */
export type InspectTarget =
  | { id: string; kind: "node" }
  | { id: string; kind: "vein" }
  | { id: string; kind: "vent" }
  | { kind: "stockpile"; resource: ResourceSelectionId };

/** One labeled value in the selection panel, such as "Remaining 400". */
export interface SelectionFact {
  iconSrc?: string;
  label: string;
  /** Tooltip with the longer explanation, when the label is terse. */
  title?: string;
  value: string;
}

/** Who a selection belongs to, which tints its portrait and heading. */
export type SelectionTone = "hazard" | "hold" | "horde" | "neutral";

/** Everything the selection panel shows about the current selection. */
export interface SelectionCard {
  facts: SelectionFact[];
  /** Letter shown when there is no icon. */
  glyph: string;
  health: { max: number; value: number } | null;
  iconSrc: string | null;
  kind:
    | "building"
    | "empty"
    | "group"
    | "node"
    | "stockpile"
    | "unit"
    | "vein"
    | "vent";
  /** Short line under the name: owner and role. */
  subtitle: string;
  /** One sentence on what this is. */
  summary: string;
  /** What the player can do with it, as short imperative lines. */
  tips: string[];
  title: string;
  tone: SelectionTone;
}

/** Map names for resource nodes, matching the gather hints. */
export const NODE_NAME: Record<ResourceId, string> = {
  coin: "Ruined Hoard",
  essence: "Essence Well",
  food: "Grove",
  iron: "Deep Iron Vein",
  spirit_herbs: "Herb Patch",
  stone: "Rock Vein",
  water: "Spring",
  wood: "Dead Timber",
};

/** How close, in map cells, a click must land to pick a Spirit Vein. */
const VEIN_CLICK_RADIUS = 0.9;

/**
 * The map feature under a click that missed every unit and building:
 * a resource node first, then a Spirit Vein, then an ember vent.
 * @param model - Shell model
 * @param point - Click in map space
 * @returns The feature to inspect, or null on open ground
 */
export function inspectTargetAt(
  model: Pick<ShellModel, "nodes" | "veins" | "vents">,
  point: MapPoint,
): InspectTarget | null {
  const node = nodeNear(model.nodes, point);
  if (node !== null) return { id: node.id, kind: "node" };
  const vein = model.veins.find(
    (entry) =>
      Math.hypot(entry.x - point.x, entry.y - point.y) <=
      Math.max(VEIN_CLICK_RADIUS, entry.radius),
  );
  if (vein !== undefined) return { id: vein.id, kind: "vein" };
  const vent = model.vents.find(
    (entry) => Math.hypot(entry.x - point.x, entry.y - point.y) <= entry.radius,
  );
  if (vent !== undefined) return { id: vent.id, kind: "vent" };
  return null;
}

/**
 * Whether a map feature is the one being inspected.
 * @param target - Current inspect target
 * @param kind - Feature kind
 * @param id - Feature id
 * @returns Whether it is inspected
 */
export function isInspected(
  target: InspectTarget | null,
  kind: "node" | "vein" | "vent",
  id: string,
): boolean {
  return target !== null && target.kind === kind && target.id === id;
}

/**
 * Drops an inspected map feature that is no longer on the map, such as a
 * node that ran dry.
 * @param model - Shell model
 * @param target - Current inspect target
 * @returns The same target, or null when it is gone
 */
export function pruneInspectTarget(
  model: Pick<ShellModel, "nodes" | "veins" | "vents">,
  target: InspectTarget | null,
): InspectTarget | null {
  if (target === null || target.kind === "stockpile") return target;
  const list = featureList(model, target.kind);
  return list.some((entry) => entry.id === target.id) ? target : null;
}

/**
 * Where to draw the map highlight for an inspected feature.
 * @param model - Shell model
 * @param target - Current inspect target
 * @returns Center and radius in map space, or null for stockpile entries
 */
export function inspectRing(
  model: Pick<ShellModel, "nodes" | "veins" | "vents">,
  target: InspectTarget | null,
): { radius: number; x: number; y: number } | null {
  if (target === null || target.kind === "stockpile") return null;
  if (target.kind === "node") {
    const node = model.nodes.find((entry) => entry.id === target.id);
    return node === undefined ? null : { radius: 1.6, x: node.x, y: node.y };
  }
  if (target.kind === "vein") {
    const vein = model.veins.find((entry) => entry.id === target.id);
    if (vein === undefined) return null;
    return { radius: Math.max(0.8, vein.radius), x: vein.x, y: vein.y };
  }
  const vent = model.vents.find((entry) => entry.id === target.id);
  return vent === undefined
    ? null
    : { radius: vent.radius, x: vent.x, y: vent.y };
}

/**
 * Describes the current selection for the bottom panel: what it is, its key
 * numbers, and what the player can do with it.
 * @param model - Shell model
 * @param selection - Selected units and building
 * @param target - Inspected map feature or stockpile entry
 * @returns The panel card
 */
export function describeSelection(
  model: ShellModel,
  selection: Selection,
  target: InspectTarget | null,
): SelectionCard {
  if (target !== null) {
    const card = describeTarget(model, target);
    if (card !== null) return card;
  }
  const building = model.buildings.find(
    (entry) => entry.id === selection.buildingId,
  );
  if (building !== undefined) return describeBuilding(model, building);
  const units = selection.unitIds
    .map((id) => model.units.find((unit) => unit.id === id))
    .filter((unit): unit is ShellUnit => unit !== undefined);
  if (units.length === 0) return EMPTY_CARD;
  const kinds = new Set(
    units.map((unit) => `${unit.factionId}:${unit.classId}`),
  );
  if (kinds.size > 1) return describeGroup(units);
  const primary = units[units.length - 1] as ShellUnit;
  return describeUnit(primary, units.length);
}

/** Card shown when nothing is selected. */
const EMPTY_CARD: SelectionCard = {
  facts: [],
  glyph: "?",
  health: null,
  iconSrc: null,
  kind: "empty",
  subtitle: "Nothing selected",
  summary: "Click anything on the map to see what it is and what you can do.",
  tips: [
    "Click a unit, building, or resource.",
    "Drag a box to select several units.",
    "Right-click to move, gather, build, or attack.",
  ],
  title: "No selection",
  tone: "neutral",
};

/**
 * @param model - Shell model
 * @param kind - Feature kind
 * @returns The features of that kind
 */
function featureList(
  model: Pick<ShellModel, "nodes" | "veins" | "vents">,
  kind: "node" | "vein" | "vent",
): readonly { id: string }[] {
  if (kind === "node") return model.nodes;
  if (kind === "vein") return model.veins;
  return model.vents;
}

/**
 * @param model - Shell model
 * @param target - Inspected feature or stockpile entry
 * @returns Its card, or null when the feature is gone
 */
function describeTarget(
  model: ShellModel,
  target: InspectTarget,
): SelectionCard | null {
  if (target.kind === "stockpile")
    return describeStockpile(model, target.resource);
  if (target.kind === "node") return describeNode(model, target.id);
  if (target.kind === "vein") return describeVein(model, target.id);
  return describeVent(model, target.id);
}

/**
 * @param model - Shell model
 * @param resource - Stockpile entry
 * @returns The stockpile card
 */
function describeStockpile(
  model: ShellModel,
  resource: ResourceSelectionId,
): SelectionCard {
  const copy = resourceSelectionCopy(resource);
  const population = resource === "population";
  let amount = "—";
  if (population && model.pop !== null) {
    amount = `${model.pop.used}/${model.pop.cap}`;
  }
  if (!population) amount = String(Math.floor(model.resources[resource]));
  return {
    facts: [{ label: population ? "Used" : "In stockpile", value: amount }],
    glyph: copy.name.slice(0, 1),
    health: null,
    iconSrc: population
      ? "/descent/resource-icons/population.png"
      : resourceIconSrc(resource),
    kind: "stockpile",
    subtitle: population ? "Hold population" : "Stockpile",
    summary: copy.description,
    tips: [`Used for: ${copy.use}`, `Get more: ${copy.more}`],
    title: copy.name,
    tone: "neutral",
  };
}

/**
 * @param model - Shell model
 * @param nodeId - Node to describe
 * @returns The node card, or null when it ran dry
 */
function describeNode(model: ShellModel, nodeId: string): SelectionCard | null {
  const node = model.nodes.find((entry) => entry.id === nodeId);
  if (node === undefined) return null;
  const copy = RESOURCE_COPY[node.resource];
  const facts: SelectionFact[] = [];
  if (node.remaining !== undefined) {
    facts.push({ label: "Remaining", value: String(node.remaining) });
  }
  if (node.gatherers !== undefined) {
    facts.push({ label: "Gatherers", value: String(node.gatherers) });
  }
  facts.push({
    iconSrc: resourceIconSrc(node.resource),
    label: "In stockpile",
    value: String(Math.floor(model.resources[node.resource])),
  });
  return {
    facts,
    glyph: copy.name.slice(0, 1),
    health: null,
    iconSrc: resourceIconSrc(node.resource),
    kind: "node",
    subtitle: `Resource · ${copy.name}`,
    summary: copy.description,
    tips: [
      "Select villagers, then right-click it to gather.",
      "Loads go to the Camp or a Storehouse.",
      `${copy.name} is used for: ${copy.use}`,
    ],
    title: NODE_NAME[node.resource],
    tone: "neutral",
  };
}

/**
 * @param model - Shell model
 * @param veinId - Vein to describe
 * @returns The vein card, or null when it is gone
 */
function describeVein(model: ShellModel, veinId: string): SelectionCard | null {
  if (!model.veins.some((entry) => entry.id === veinId)) return null;
  const boosted = model.buildOptions
    .filter((option) =>
      option.hints.some((hint) => hint.includes("Spirit Vein")),
    )
    .map((option) => option.name);
  const tips = ["Press Build, then place a building on the vein."];
  if (boosted.length > 0) tips.unshift(`Boosts: ${boosted.join(", ")}.`);
  return {
    facts: [],
    glyph: "✦",
    health: null,
    iconSrc: resourceIconSrc("essence"),
    kind: "vein",
    subtitle: "Building site",
    summary:
      "A seam of spirit energy. Some buildings work better on top of it.",
    tips,
    title: "Spirit Vein",
    tone: "neutral",
  };
}

/**
 * @param model - Shell model
 * @param ventId - Vent to describe
 * @returns The vent card, or null when it is gone
 */
function describeVent(model: ShellModel, ventId: string): SelectionCard | null {
  const vent = model.vents.find((entry) => entry.id === ventId);
  if (vent === undefined) return null;
  return {
    facts: [{ label: "Radius", value: `${vent.radius} cells` }],
    glyph: "!",
    health: null,
    iconSrc: null,
    kind: "vent",
    subtitle: "Hazard",
    summary: "Scalding ground. Anything standing inside the ring burns.",
    tips: [
      "Keep units out of the ring.",
      "A Fire-ward Wall nearby shields units from the burn.",
    ],
    title: vent.label,
    tone: "hazard",
  };
}

/**
 * @param model - Shell model
 * @param building - Selected building
 * @returns The building card
 */
function describeBuilding(
  model: ShellModel,
  building: ShellBuilding,
): SelectionCard {
  const enemy = building.factionId === "horde";
  const health =
    building.hitPoints === null || building.maxHitPoints === null
      ? null
      : { max: building.maxHitPoints, value: building.hitPoints };
  const facts: SelectionFact[] = [];
  if (building.activity !== null) {
    facts.push({ label: "Now", value: building.activity });
  }
  if (building.rallyPoint !== null) {
    facts.push({
      label: "Rally",
      value: `${building.rallyPoint.x}, ${building.rallyPoint.y}`,
    });
  }
  return {
    facts,
    glyph: building.name.slice(0, 1),
    health,
    iconSrc: null,
    kind: "building",
    subtitle: buildingSubtitle(building),
    summary: buildingJob(model, building.buildingType),
    tips: buildingTips(model, building),
    title: building.name,
    tone: enemy ? "horde" : "hold",
  };
}

/**
 * @param building - Selected building
 * @returns Owner, tier, and construction state
 */
function buildingSubtitle(building: ShellBuilding): string {
  if (building.factionId === "horde") return "Enemy structure";
  if (building.constructing) return "Your building · Under construction";
  if (building.tier !== null) return `Your building · ${building.tier}`;
  return "Your building";
}

/**
 * @param model - Shell model
 * @param buildingType - Building id
 * @returns The building's one-line job
 */
function buildingJob(model: ShellModel, buildingType: string): string {
  const option = model.buildOptions.find(
    (entry) => entry.buildingType === buildingType,
  );
  if (option !== undefined) return sentence(option.job);
  const definition = listBuildingDefs().find(
    (entry) => entry.id === buildingType,
  );
  if (definition !== undefined) return sentence(definition.job);
  return "A structure of the Hold.";
}

/**
 * @param model - Shell model
 * @param building - Selected building
 * @returns What the player can do with it
 */
function buildingTips(model: ShellModel, building: ShellBuilding): string[] {
  if (building.factionId === "horde") {
    return [
      "Select soldiers, then right-click it to attack.",
      "Breakers deal double damage to structures.",
    ];
  }
  if (building.constructing) {
    return ["Select villagers, then right-click it to help build."];
  }
  const tips: string[] = [];
  const trains = model.trainOptions.some(
    (option) => option.buildingId === building.id,
  );
  if (trains) tips.push("Pick a unit on the right to train it.");
  if (
    building.buildingType === "camp" ||
    building.buildingType === "barracks"
  ) {
    tips.push("Right-click the map to set where new units gather.");
  }
  const option = model.buildOptions.find(
    (entry) => entry.buildingType === building.buildingType,
  );
  for (const hint of option?.hints ?? []) tips.push(hint);
  if (
    building.hitPoints !== null &&
    building.maxHitPoints !== null &&
    building.hitPoints < building.maxHitPoints
  ) {
    tips.push("Damaged: right-click it with villagers to repair.");
  }
  return tips;
}

/**
 * @param units - Selected units of more than one kind
 * @returns The mixed-group card
 */
function describeGroup(units: readonly ShellUnit[]): SelectionCard {
  return {
    facts: [],
    glyph: String(units.length),
    health: null,
    iconSrc: null,
    kind: "group",
    subtitle: "Mixed selection",
    summary: "Click a group icon to keep only those units.",
    tips: [
      "Right-click ground to move in formation.",
      "Frontline leads; ranged and villagers follow.",
    ],
    title: `${units.length} units`,
    tone: "hold",
  };
}

/**
 * @param unit - Primary selected unit
 * @param count - How many units of its kind are selected
 * @returns The unit card
 */
function describeUnit(unit: ShellUnit, count: number): SelectionCard {
  const guide = UNIT_TRAINING_GUIDES[unit.classId];
  const enemy = unit.factionId === "horde";
  const health =
    unit.hitPoints === null || unit.maxHitPoints === null
      ? null
      : { max: unit.maxHitPoints, value: unit.hitPoints };
  const label = CLASS_LABEL[unit.classId];
  const title = count > 1 ? `${count} ${label}s` : unit.name;
  return {
    facts: unitFacts(unit),
    glyph: unit.name.slice(0, 1),
    health: count > 1 ? null : health,
    iconSrc: guide.iconSrc,
    kind: "unit",
    subtitle: enemy
      ? `Enemy · ${guide.role}`
      : `${count > 1 ? "Your units" : "Your unit"} · ${guide.role}`,
    summary: guide.description,
    tips: unitTips(unit),
    title,
    tone: enemy ? "horde" : "hold",
  };
}

/**
 * @param unit - Primary selected unit
 * @returns Its status values
 */
function unitFacts(unit: ShellUnit): SelectionFact[] {
  if (unit.factionId === "horde") return [];
  if (unit.classId === "villager") {
    const facts: SelectionFact[] = [
      { label: "Doing", value: villagerActivity(unit) },
    ];
    if (unit.carrying === null) {
      facts.push({ label: "Carrying", value: "Nothing" });
      return facts;
    }
    facts.push({
      iconSrc: resourceIconSrc(unit.carrying.resource),
      label: "Carrying",
      value: `${Math.round(unit.carrying.amount)} ${RESOURCE_COPY[unit.carrying.resource].name}`,
    });
    return facts;
  }
  const cultivation = unit.cultivation;
  if (cultivation === null) return [];
  return [
    { label: "Rank", value: cultivation.rank },
    { label: "School", value: schoolName(cultivation.school) },
    {
      label: "Toxicity",
      value: `${cultivation.toxicity}/${cultivation.toxicityCap}`,
    },
    {
      label: "Break",
      title: "Breakthrough chance",
      value: formatChance(cultivation.successChance),
    },
  ];
}

/**
 * @param unit - Villager
 * @returns What it is doing, in a word or two
 */
function villagerActivity(unit: ShellUnit): string {
  if (unit.activity !== null) return unit.activity;
  return unit.idle ? "Idle" : "Walking";
}

/**
 * @param unit - Primary selected unit
 * @returns What the player can do with it
 */
function unitTips(unit: ShellUnit): string[] {
  if (unit.factionId === "horde") {
    return ["Select soldiers, then right-click it to attack."];
  }
  if (unit.classId === "villager") {
    return [
      "Right-click a resource to gather it.",
      "Right-click a building site to build or repair.",
      "Press Build to place a new building.",
    ];
  }
  const tips = ["Right-click an enemy to attack, or ground to move."];
  const next = unit.cultivation?.missingRequirements[0];
  if (next !== undefined) tips.push(`Next rank: ${next}`);
  return tips;
}

/**
 * @param text - Short phrase, possibly without a period
 * @returns The phrase as a sentence
 */
function sentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return trimmed;
  const capitalized = trimmed[0]?.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}
