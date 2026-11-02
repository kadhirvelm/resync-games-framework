import type { PlayableCardEffect } from "@resync-game-framework/api";
import { PLAYABLE_CARD_EFFECT_AMOUNTS } from "./playableCardSpec";

/**
 * Rules a later card in a character's line must beat.
 * Level 1 chooses the cost and effect kinds. Levels 2 through 4 keep both
 * and raise the amounts.
 */
export interface CardProgression {
  /** Aether cost locked by the first card in the line */
  aetherCost: number;
  /** Level being written, from 2 through 4 */
  level: number;
  /** Effects on the immediately previous level */
  previousEffects: PlayableCardEffect[];
}

/**
 * Explains how a later card must grow from the previous level.
 * @param progression - Locked cost and the previous level's effects
 * @returns Instructions to append to the card request
 */
export function renderCardProgressionPrompt(
  progression: CardProgression,
): string {
  return [
    `This is level ${progression.level} of the same technique.`,
    `Keep the aether cost at ${progression.aetherCost}.`,
    `Keep these effect kinds in this order: ${describeEffects(progression.previousEffects)}.`,
    "Raise every amount above the previous level. If an amount is already at its maximum, keep that maximum.",
  ].join(" ");
}

/**
 * Checks that a card stays on its character's line and is stronger than the previous level.
 * @param card - Submitted cost and effects
 * @param progression - The line this card must continue
 * @returns An error the model can correct, or undefined when the card progresses
 */
export function strongerCardError(
  card: { aetherCost: number; effects: PlayableCardEffect[] },
  progression: CardProgression,
): string | undefined {
  if (card.aetherCost !== progression.aetherCost) {
    return `Keep the aether cost at ${progression.aetherCost}. This level used ${card.aetherCost}.`;
  }
  if (card.effects.length !== progression.previousEffects.length) {
    return `Keep ${progression.previousEffects.length} effect(s): ${describeEffects(progression.previousEffects)}.`;
  }

  for (const [index, previous] of progression.previousEffects.entries()) {
    const next = card.effects[index];
    if (next === undefined || next.kind !== previous.kind) {
      return `Keep effect ${index + 1} as ${previous.kind}.`;
    }
    if ((next.chainsFrom ?? "") !== (previous.chainsFrom ?? "")) {
      return `Keep the ${previous.kind} effect chaining from ${previous.chainsFrom ?? "nothing"}.`;
    }
    const growthError = readGrowthError(previous, next);
    if (growthError !== undefined) {
      return growthError;
    }
  }

  return undefined;
}

/**
 * @param previous - Effect on the prior level
 * @param next - Effect submitted for this level
 * @returns An error when the amount did not grow, within the toolkit maximum
 */
function readGrowthError(
  previous: PlayableCardEffect,
  next: PlayableCardEffect,
): string | undefined {
  const maximum = PLAYABLE_CARD_EFFECT_AMOUNTS[previous.kind].max;
  if (previous.amount >= maximum) {
    if (next.amount === maximum) {
      return undefined;
    }
    return `Keep ${previous.kind} at its maximum of ${maximum}.`;
  }
  if (next.amount > previous.amount) {
    return undefined;
  }
  return `Raise ${previous.kind} above ${previous.amount}.`;
}

/**
 * @param effects - Effects in card order
 * @returns A compact signature such as "attack 8, defend 6"
 */
function describeEffects(effects: readonly PlayableCardEffect[]): string {
  return effects
    .map((effect) => {
      const chain =
        effect.chainsFrom === undefined ? "" : ` from ${effect.chainsFrom}`;
      return `${effect.kind} ${effect.amount}${chain}`;
    })
    .join(", ");
}
