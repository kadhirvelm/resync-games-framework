import {
  RESOURCE_IDS,
  type ResourceId,
  type ResourceStockpile,
} from "../logic/types";
import { RESOURCE_COPY } from "./text";

/** One priced amount: a stockpile resource or population. */
export interface CostItem {
  amount: number;
  resource: ResourceId | "population";
}

/** A price as the command card and build menu draw it: icon, then amount. */
export interface CostLine {
  /** Orders bought at once, shown as "×N". Omitted for a single order. */
  count?: number;
  /** Resource and population amounts, in stockpile order. */
  items: readonly CostItem[];
  /** Seconds the order takes. Omitted for instant actions. */
  seconds?: number;
  /** Whether {@link seconds} is per order inside a batch. */
  secondsEach?: boolean;
}

/** What the player has to spend, used to mark amounts they are short of. */
export interface CostStock {
  /** Free population, or null when the snapshot publishes no cap. */
  popFree: number | null;
  resources: Readonly<Partial<Record<ResourceId, number>>>;
}

/**
 * Builds a cost line from a sparse resource cost.
 * @param cost - Resource amounts; zero and missing amounts are dropped
 * @param extras - Population, duration, and batch size, when they apply
 * @returns Items in stockpile order, population last
 */
export function costLineFrom(
  cost: Partial<ResourceStockpile>,
  extras: {
    count?: number;
    pop?: number;
    seconds?: number;
    secondsEach?: boolean;
  } = {},
): CostLine {
  const items: CostItem[] = [];
  for (const resource of RESOURCE_IDS) {
    const amount = cost[resource] ?? 0;
    if (amount > 0) items.push({ amount, resource });
  }
  if (extras.pop !== undefined && extras.pop > 0) {
    items.push({ amount: extras.pop, resource: "population" });
  }
  const line: CostLine = { items };
  if (extras.count !== undefined && extras.count > 1) line.count = extras.count;
  if (extras.seconds !== undefined && extras.seconds > 0) {
    line.seconds = Math.round(extras.seconds);
  }
  if (extras.secondsEach === true) line.secondsEach = true;
  return line;
}

/**
 * @param item - One priced amount
 * @param stock - What the player has
 * @returns Whether the player cannot cover this amount right now
 */
export function isCostItemShort(item: CostItem, stock: CostStock): boolean {
  if (item.resource === "population") {
    return stock.popFree !== null && stock.popFree < item.amount;
  }
  return (stock.resources[item.resource] ?? 0) < item.amount;
}

/**
 * @param line - Cost line
 * @param stock - What the player has
 * @returns Whether any amount is more than the player has
 */
export function isCostLineShort(line: CostLine, stock: CostStock): boolean {
  return line.items.some((item) => isCostItemShort(item, stock));
}

/**
 * @param resource - Priced resource
 * @returns Its player-facing name
 */
export function costItemName(resource: CostItem["resource"]): string {
  if (resource === "population") return "Population";
  return RESOURCE_COPY[resource].name;
}

/**
 * Spells a cost line out for screen readers and native tooltips.
 * @param line - Cost line
 * @returns Text such as "Stone 40, Wood 40, 12 seconds", or "Free"
 */
export function costLineText(line: CostLine): string {
  const parts: string[] = [];
  if (line.count !== undefined) parts.push(`${line.count} orders`);
  for (const item of line.items) {
    parts.push(`${costItemName(item.resource)} ${item.amount}`);
  }
  if (line.seconds !== undefined) {
    parts.push(`${line.seconds} seconds${line.secondsEach ? " each" : ""}`);
  }
  if (parts.length === 0) return "Free";
  return parts.join(", ");
}
