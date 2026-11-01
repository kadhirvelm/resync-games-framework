import type { PlayableCardRules } from "@towers-of-coreborn/api";
import { scaleCardRules } from "./cardRules";
import {
  type CardDefinition,
  type CorebornRole,
  TIER_HIT_POINT_BONUS,
  type TierNumber,
} from "./towerTypes";

/** Damage and block multiplier for each tier, relative to tier 1. */
export const TIER_POWER = [1, 1.35, 1.75, 2.2] as const;

/** Health at tier 1 for each role. */
export const ROLE_BASE_HIT_POINTS: Record<CorebornRole, number> = {
  guardian: 30,
  mender: 24,
  mystic: 20,
  striker: 20,
};

/** Words in a character's prompt that point at each role. */
const ROLE_WORDS: Record<CorebornRole, RegExp> = {
  guardian:
    /\b(shield\w*|guard\w*|bulwark|defen\w*|ward\w*|armou?r\w*|wall|tank|protect\w*|bastion|sentinel)\b/gi,
  mender:
    /\b(heal\w*|restor\w*|mend\w*|caretaker|support\w*|tend\w*|medic\w*|cleric|life|nurtur\w*|soothe\w*)\b/gi,
  mystic:
    /\b(aether|qi|channel\w*|spirit\w*|mystic\w*|sage|scholar|ritual\w*|monk|seer|talisman\w*|incant\w*)\b/gi,
  striker:
    /\b(bow|arrow\w*|blade\w*|sword\w*|strik\w*|attack\w*|scout\w*|hunt\w*|spear\w*|assassin\w*|duel\w*|fist\w*|archer\w*)\b/gi,
};

/** Roles handed out in order when a prompt names none. */
const ROLE_ROTATION: CorebornRole[] = [
  "striker",
  "guardian",
  "mender",
  "mystic",
];

/**
 * Picks a role from the words in a character's prompt and descriptions.
 * @param text - Prompt, theme, and level descriptions joined together
 * @param index - Character position, used when no role word appears
 * @returns The role with the most matching words
 */
export function inferCorebornRole(text: string, index: number): CorebornRole {
  let best: CorebornRole | undefined;
  let bestCount = 0;
  for (const role of ROLE_ROTATION) {
    const count = text.match(ROLE_WORDS[role])?.length ?? 0;
    if (count > bestCount) {
      best = role;
      bestCount = count;
    }
  }
  return best ?? (ROLE_ROTATION[index % ROLE_ROTATION.length] as CorebornRole);
}

/** Tier 1 stand-in technique for each role. */
const ROLE_TECHNIQUES: Record<CorebornRole, PlayableCardRules> = {
  guardian: {
    aetherCost: 1,
    effects: [
      { amount: 6, kind: "defend", text: "Gain 6 block." },
      { amount: 3, kind: "attack", text: "Deal 3 damage." },
    ],
    name: "Shield Bash",
  },
  mender: {
    aetherCost: 1,
    effects: [
      { amount: 4, kind: "defend", text: "Grant 4 block." },
      { amount: 1, kind: "draw", text: "Draw 1 card." },
    ],
    name: "Mending Light",
  },
  mystic: {
    aetherCost: 0,
    effects: [
      { amount: 1, kind: "aether", text: "Gain 1 Aether." },
      { amount: 3, kind: "attack", text: "Deal 3 damage." },
    ],
    name: "Spirit Spark",
  },
  striker: {
    aetherCost: 1,
    effects: [{ amount: 6, kind: "attack", text: "Deal 6 damage." }],
    name: "Piercing Strike",
  },
};

const ROMAN = ["I", "II", "III", "IV"] as const;

/**
 * Writes four tier cards for a role when no generated card exists.
 * Every tier keeps the cost and effect kinds; only the amounts rise.
 * @param role - The character's role
 * @param idPrefix - Prefix for the card ids
 * @param techniqueName - Name to use instead of the role's default
 * @returns Cards for tiers 1 through 4
 */
export function synthesizeTierCards(
  role: CorebornRole,
  idPrefix: string,
  techniqueName?: string,
): CardDefinition[] {
  const base = ROLE_TECHNIQUES[role];
  const name = techniqueName ?? base.name;
  return TIER_POWER.map((power, index) => ({
    id: `${idPrefix}-tier-${index + 1}`,
    rules: scaleCardRules(base, power, `${name} ${ROMAN[index]}`),
  }));
}

/**
 * Fills the gaps in a character's generated card progression.
 * A missing tier copies the nearest generated tier below it, scaled up.
 * When no lower tier exists, the nearest higher tier is scaled down.
 * With no generated cards at all, the role's stand-in technique is used.
 * @param generated - Generated cards by tier, index 0 is tier 1
 * @param role - The character's role
 * @param idPrefix - Prefix for ids of filled cards
 * @returns Exactly four cards, tier 1 first
 */
export function completeTierCards(
  generated: readonly (CardDefinition | undefined)[],
  role: CorebornRole,
  idPrefix: string,
): CardDefinition[] {
  const known = generated
    .slice(0, 4)
    .map((card, index) => ({ card, index }))
    .filter((entry): entry is { card: CardDefinition; index: number } =>
      Boolean(entry.card),
    );
  if (known.length === 0) {
    return synthesizeTierCards(role, idPrefix);
  }

  return TIER_POWER.map((power, index) => {
    const own = generated[index];
    if (own) {
      return own;
    }
    const source = nearestKnownTier(known, index);
    const sourcePower = TIER_POWER[source.index] ?? 1;
    const steps = index - source.index;
    const name =
      steps > 0
        ? `${source.card.rules.name} +${steps}`
        : source.card.rules.name;
    return {
      flavor: source.card.flavor,
      id: `${idPrefix}-tier-${index + 1}`,
      imageUrl: source.card.imageUrl,
      rules: scaleCardRules(source.card.rules, power / sourcePower, name),
    };
  });
}

/**
 * @param known - Generated tiers
 * @param index - Tier index being filled
 * @returns The closest generated tier below, or the closest above
 */
function nearestKnownTier(
  known: { card: CardDefinition; index: number }[],
  index: number,
): { card: CardDefinition; index: number } {
  const below = known.filter((entry) => entry.index < index);
  if (below.length > 0) {
    return below[below.length - 1] as { card: CardDefinition; index: number };
  }
  return known[0] as { card: CardDefinition; index: number };
}

/**
 * @param baseHitPoints - Health at tier 1
 * @param tier - Tier from 1 through 4
 * @returns Maximum health at that tier
 */
export function tierHitPoints(baseHitPoints: number, tier: TierNumber): number {
  return baseHitPoints + (tier - 1) * TIER_HIT_POINT_BONUS;
}
