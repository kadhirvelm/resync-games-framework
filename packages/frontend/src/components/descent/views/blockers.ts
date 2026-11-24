import {
  POPULATION_BLOCKER,
  RESOURCE_BLOCKER,
} from "../logic/slice/sliceTraining";
import { type CostLine, type CostStock, isCostItemShort } from "./costLine";
import { RESOURCE_COPY } from "./text";

/** One reason an action cannot run, and what the player can do about it. */
export interface BlockerItem {
  /** How to clear the blocker, when the UI knows. */
  fix?: string;
  /** What is wrong, e.g. "Battle merit 20/100". */
  problem: string;
}

/** A requirement pattern and the advice that clears it. */
interface FixRule {
  fix: string | ((match: RegExpMatchArray) => string);
  pattern: RegExp;
}

/**
 * Ordered advice for the reasons the sim publishes. The first match wins, so
 * specific patterns sit above broad ones.
 */
const FIX_RULES: readonly FixRule[] = [
  {
    fix: "Fight: kills by this unit, or near it, earn Merit.",
    pattern: /merit/i,
  },
  {
    fix: "Land killing blows with this unit.",
    pattern: /combat proof/i,
  },
  {
    fix: "Kill enemies, or Meditate (M) with a Qi cultivator — 2.5× near a Spirit Vein, Array, or Pavilion.",
    pattern: /^essence \d/i,
  },
  {
    fix: "Send villagers to gather the listed materials.",
    pattern: /tier materials/i,
  },
  {
    fix: (match) => `Select the Camp and upgrade the Hold to ${match[1]}.`,
    pattern: /(?:hold must reach|cultivation hall requires) (\w+)/i,
  },
  {
    fix: "Villagers: Build ▸ Cultivation Hall.",
    pattern: /build a cultivation hall/i,
  },
  {
    fix: "Brew one at an Alchemy Furnace.",
    pattern: /breakthrough pill/i,
  },
  {
    fix: "Each Hold can field only one cultivator per path; a replacement unlocks if they fall.",
    pattern: /limit 1:/i,
  },
  {
    fix: "Build Housing to raise the population cap.",
    pattern: /population/i,
  },
  {
    fix: "This scenario is already at its rank cap; use school and pill bonuses instead.",
    pattern: /rank cap/i,
  },
  {
    fix: "Pick Ember, Rime, or Blood on this unit's command card.",
    pattern: /school choice/i,
  },
  {
    fix: "Wait for the injury to heal.",
    pattern: /injury/i,
  },
  {
    fix: "Wait for the current channel to finish.",
    pattern: /already channeling/i,
  },
  {
    fix: "Wait for it to finish building.",
    pattern: /under construction/i,
  },
  {
    fix: "Wait for an order to finish, or cancel one in the queue.",
    pattern: /queue is full/i,
  },
  {
    fix: (match) => `Select the Camp and upgrade the Hold to ${match[1]}.`,
    pattern: /needs (\w+) to train/i,
  },
  {
    fix: "Villagers: Build ▸ Barracks.",
    pattern: /train at a barracks/i,
  },
  {
    fix: "Villagers: Build ▸ Cultivator Sanctum.",
    pattern: /train at a cultivator sanctum/i,
  },
  {
    fix: "Wait for it to finish.",
    pattern: /already (?:rising|brewing)/i,
  },
  {
    fix: "Send villagers to gather Food and Water.",
    pattern: /food and water/i,
  },
];

/**
 * Advice that clears one published blocker line.
 * @param line - Requirement or reason the sim published
 * @returns What the player can do, or undefined when the UI has no advice
 */
export function requirementFix(line: string): string | undefined {
  for (const rule of FIX_RULES) {
    const match = line.match(rule.pattern);
    if (match === null) continue;
    return typeof rule.fix === "string" ? rule.fix : rule.fix(match);
  }
  return undefined;
}

/**
 * Turns published reasons into problem-and-fix items.
 * @param lines - Requirement or reason lines
 * @returns One item per line, in the same order
 */
export function blockersFromLines(lines: readonly string[]): BlockerItem[] {
  return lines.map((line) => {
    const fix = requirementFix(line);
    return fix === undefined ? { problem: line } : { fix, problem: line };
  });
}

/**
 * Names every amount the player is short of and where to get more.
 * @param cost - Price of the action
 * @param stock - What the player can spend
 * @returns One item per short resource, or population
 */
export function costShortfallBlockers(
  cost: CostLine,
  stock: CostStock,
): BlockerItem[] {
  const items: BlockerItem[] = [];
  for (const item of cost.items) {
    if (!isCostItemShort(item, stock)) continue;
    if (item.resource === "population") {
      items.push({
        fix: "Build Housing to raise the population cap.",
        problem: `Need ${item.amount} free population (have ${Math.max(0, stock.popFree ?? 0)})`,
      });
      continue;
    }
    const copy = RESOURCE_COPY[item.resource];
    const have = Math.floor(stock.resources[item.resource] ?? 0);
    items.push({
      fix: `Villagers: ${copy.more}`,
      problem: `Need ${item.amount - have} more ${copy.name}`,
    });
  }
  return items;
}

/**
 * Explains why a priced action is blocked: exact shortfalls when the reason
 * is cost, otherwise the published reason with its advice.
 * @param reason - Published reason, if any
 * @param cost - Price drawn on the button, if any
 * @param stock - What the player can spend
 * @returns Blocker items, never empty
 */
export function pricedActionBlockers(
  reason: string | undefined,
  cost: CostLine | undefined,
  stock: CostStock,
): BlockerItem[] {
  const costReason =
    reason === undefined ||
    reason === RESOURCE_BLOCKER ||
    reason === POPULATION_BLOCKER ||
    /not enough resources/i.test(reason);
  if (cost !== undefined && costReason) {
    const shortfalls = costShortfallBlockers(cost, stock);
    if (shortfalls.length > 0) return shortfalls;
  }
  return blockersFromLines([reason ?? "Not available right now."]);
}

/**
 * The notice shown when the player clicks a blocked action.
 * @param label - Action name
 * @param blockers - Why it is blocked
 * @returns One sentence naming the first blocker and its fix
 */
export function blockedToast(
  label: string,
  blockers: readonly BlockerItem[],
): string {
  const first = blockers[0];
  if (first === undefined) return `Can't ${label} right now.`;
  const more = blockers.length > 1 ? ` (+${blockers.length - 1} more)` : "";
  const fix = first.fix === undefined ? "" : ` → ${first.fix}`;
  return `Can't ${label}: ${first.problem}${more}${fix}`;
}
