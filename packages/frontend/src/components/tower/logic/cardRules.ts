import type {
  PlayableCardEffect,
  PlayableCardRules,
} from "@towers-of-coreborn/api";

/** What a card must be aimed at before it resolves. */
export type CardTargeting = "enemy" | "ally" | "none";

/**
 * Whether a combo effect lands as block instead of damage.
 * A combo amplifies the kind it chains from: chaining from defend shields an
 * ally, and every other chain strikes an enemy.
 * @param effect - Combo effect
 * @returns True when the combo grants block
 */
export function comboGrantsBlock(effect: PlayableCardEffect): boolean {
  return effect.kind === "combo" && effect.chainsFrom === "defend";
}

/**
 * @param effect - One card effect
 * @returns Whether the effect deals damage to an enemy
 */
export function effectHitsEnemy(effect: PlayableCardEffect): boolean {
  if (effect.kind === "attack") {
    return true;
  }
  return effect.kind === "combo" && !comboGrantsBlock(effect);
}

/**
 * @param effect - One card effect
 * @returns Whether the effect gives block to an ally
 */
export function effectShieldsAlly(effect: PlayableCardEffect): boolean {
  return effect.kind === "defend" || comboGrantsBlock(effect);
}

/**
 * Picks the one target a card needs. Damage wins over block, so a card that
 * does both is aimed at an enemy and its block goes to the card's owner.
 * @param rules - Card rules
 * @returns Enemy, ally, or no target
 */
export function cardTargeting(rules: PlayableCardRules): CardTargeting {
  if (rules.effects.some(effectHitsEnemy)) {
    return "enemy";
  }
  if (rules.effects.some(effectShieldsAlly)) {
    return "ally";
  }
  return "none";
}

/**
 * @param aetherCost - Non-negative Aether cost
 * @returns Cost label, singular when the card costs 1
 */
export function formatAetherCost(aetherCost: number): string {
  if (aetherCost === 1) {
    return "1 Aether";
  }
  return `${aetherCost} Aether`;
}

/**
 * Builds the rules line players read for one effect.
 * Generated text is kept. Missing text is written from the kind and amount.
 * @param effect - One card effect
 * @returns Player-facing rules text
 */
export function describeEffect(effect: PlayableCardEffect): string {
  const text = effect.text.trim();
  if (text !== "") {
    return text;
  }
  return fallbackEffectText(effect);
}

/**
 * @param effect - One card effect without written text
 * @returns Rules text built from the kind and amount
 */
export function fallbackEffectText(effect: PlayableCardEffect): string {
  if (effect.kind === "attack") {
    return `Deal ${effect.amount} damage.`;
  }
  if (effect.kind === "defend") {
    return `Grant ${effect.amount} block.`;
  }
  if (effect.kind === "draw") {
    return effect.amount === 1
      ? "Draw 1 card."
      : `Draw ${effect.amount} cards.`;
  }
  if (effect.kind === "aether") {
    return `Gain ${effect.amount} Aether.`;
  }
  const chain = effect.chainsFrom ?? "attack";
  const result = comboGrantsBlock(effect)
    ? `grant ${effect.amount} block`
    : `deal ${effect.amount} damage`;
  return `Combo (after ${chain}): ${result}.`;
}

/**
 * Scales every effect amount on a card while keeping its kinds and cost.
 * Used to write upgraded copies when a tier has no generated card.
 * @param rules - Base rules
 * @param factor - Multiplier applied to each amount
 * @param name - Name for the scaled card
 * @returns Rules with raised amounts and rewritten numbers in their text
 */
export function scaleCardRules(
  rules: PlayableCardRules,
  factor: number,
  name: string,
): PlayableCardRules {
  return {
    aetherCost: rules.aetherCost,
    effects: rules.effects.map((effect) => {
      const amount = scaleEffectAmount(effect, factor);
      // "Draw 1 card." would read "Draw 2 card.", so draw text is rebuilt.
      const text =
        effect.kind === "draw" && amount !== effect.amount
          ? fallbackEffectText({ ...effect, amount })
          : replaceAmount(effect.text, effect.amount, amount);
      return { ...effect, amount, text };
    }),
    name,
  };
}

/**
 * Draw and Aether stay small: they grow by at most one per step and never shrink.
 * @param effect - Effect being scaled
 * @param factor - Multiplier for damage and block
 * @returns The scaled amount
 */
function scaleEffectAmount(effect: PlayableCardEffect, factor: number): number {
  if (effect.kind === "draw") {
    return Math.min(2, effect.amount + (factor >= 1.6 ? 1 : 0));
  }
  if (effect.kind === "aether") {
    return Math.min(3, effect.amount + (factor >= 1.6 ? 1 : 0));
  }
  return Math.max(1, Math.round(effect.amount * factor));
}

/**
 * @param text - Rules text that may contain the old amount
 * @param previous - Old amount
 * @param next - New amount
 * @returns Text with the first matching number replaced, or rebuilt when none matched
 */
function replaceAmount(text: string, previous: number, next: number): string {
  const pattern = new RegExp(`\\b${previous}\\b`);
  if (pattern.test(text)) {
    return text.replace(pattern, String(next));
  }
  return text;
}
