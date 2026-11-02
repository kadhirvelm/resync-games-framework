import type {
  PlayableCardChainKind,
  PlayableCardEffect,
  PlayableCardKind,
} from "@resync-game-framework/api";
import {
  isPlayableCardChainKind,
  isPlayableCardKind,
  PLAYABLE_CARD_AETHER_COST,
  PLAYABLE_CARD_EFFECT_AMOUNTS,
  PLAYABLE_CARD_STATUS_WORDS,
} from "./playableCardSpec";

/**
 * Card text the model submits after it has searched the Lore document.
 * `scene` is painted and is not stored as player-facing text.
 */
export interface PlayableCardDraft {
  aetherCost: number;
  description: string;
  effects: PlayableCardEffect[];
  name: string;
  scene: string;
}

/**
 * Checks a model-submitted card against the combat toolkit.
 * @param value - JSON arguments from the submit tool
 * @returns The draft, or a single error the model can correct
 */
export function validatePlayableCardDraft(
  value: unknown,
): { draft: PlayableCardDraft } | { error: string } {
  if (!isRecord(value)) {
    return { error: "Card draft must be an object." };
  }

  const name = readBoundedString(value.name, 2, 48, "Name");
  if (typeof name !== "string") {
    return name;
  }
  const description = readBoundedString(
    value.description,
    20,
    240,
    "Description",
  );
  if (typeof description !== "string") {
    return description;
  }
  if (countSentences(description) > 2) {
    return { error: "Description must be one or two sentences." };
  }
  const scene = readBoundedString(value.scene, 16, 800, "Scene");
  if (typeof scene !== "string") {
    return scene;
  }
  const aetherCost = readInteger(
    value.aetherCost,
    PLAYABLE_CARD_AETHER_COST.min,
    PLAYABLE_CARD_AETHER_COST.max,
    "Aether cost",
  );
  if (typeof aetherCost !== "number") {
    return aetherCost;
  }

  const effects = readEffects(value.effects);
  if (!Array.isArray(effects)) {
    return effects;
  }

  return {
    draft: {
      aetherCost,
      description,
      effects,
      name,
      scene,
    },
  };
}

/**
 * @param value - Candidate string
 * @param min - Minimum trimmed length
 * @param max - Maximum trimmed length
 * @param label - Field name used in the error
 * @returns The trimmed string, or an error result
 */
function readBoundedString(
  value: unknown,
  min: number,
  max: number,
  label: string,
): string | { error: string } {
  if (typeof value !== "string") {
    return { error: `${label} must be text.` };
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return { error: `${label} must be ${min} to ${max} characters.` };
  }
  return trimmed;
}

/**
 * @param value - Candidate number
 * @param min - Inclusive minimum
 * @param max - Inclusive maximum
 * @param label - Field name used in the error
 * @returns The integer, or an error result
 */
function readInteger(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number | { error: string } {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { error: `${label} must be a whole number.` };
  }
  if (value < min || value > max) {
    return { error: `${label} must be from ${min} to ${max}.` };
  }
  return value;
}

/**
 * @param value - Candidate effects array
 * @returns One or two legal effects, or an error result
 */
function readEffects(value: unknown): PlayableCardEffect[] | { error: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    return { error: "A card needs 1 or 2 effects." };
  }

  const effects: PlayableCardEffect[] = [];
  const seenKinds = new Set<PlayableCardKind>();
  for (const entry of value) {
    const effect = readEffect(entry, seenKinds);
    if (!("kind" in effect)) {
      return effect;
    }
    seenKinds.add(effect.kind);
    effects.push(effect);
  }
  return effects;
}

/**
 * @param value - One effect object
 * @param seenKinds - Kinds already accepted on this card
 * @returns The effect, or an error result
 */
function readEffect(
  value: unknown,
  seenKinds: ReadonlySet<PlayableCardKind>,
): PlayableCardEffect | { error: string } {
  if (!isRecord(value)) {
    return { error: "Each effect must be an object." };
  }
  if (!isPlayableCardKind(value.kind)) {
    return {
      error:
        "Effect kind must be attack, defend, draw, aether, or combo. Status effects are out of scope.",
    };
  }
  if (seenKinds.has(value.kind)) {
    return { error: `A card can use ${value.kind} only once.` };
  }

  const range = PLAYABLE_CARD_EFFECT_AMOUNTS[value.kind];
  const amount = readInteger(value.amount, range.min, range.max, "Amount");
  if (typeof amount !== "number") {
    return amount;
  }
  const text = readBoundedString(value.text, 8, 160, "Effect text");
  if (typeof text !== "string") {
    return text;
  }
  const statusWord = findStatusWord(text);
  if (statusWord !== undefined) {
    return {
      error: `Effect text cannot include "${statusWord}". Status effects are out of scope.`,
    };
  }

  const chainsFrom = readChainsFrom(value.kind, value.chainsFrom);
  if (typeof chainsFrom !== "string" && chainsFrom !== undefined) {
    return chainsFrom;
  }

  if (chainsFrom === undefined) {
    return { amount, kind: value.kind, text };
  }
  return { amount, chainsFrom, kind: value.kind, text };
}

/**
 * @param kind - Effect kind
 * @param value - Submitted chain target; empty when the effect is not a combo
 * @returns The chain target, `undefined` when absent, or an error result
 */
function readChainsFrom(
  kind: PlayableCardKind,
  value: unknown,
): PlayableCardChainKind | undefined | { error: string } {
  const chainsFrom = value === "" || value === undefined ? undefined : value;
  if (kind === "combo" && !isPlayableCardChainKind(chainsFrom)) {
    return {
      error: "A combo effect must chain from attack, defend, draw, or aether.",
    };
  }
  if (kind !== "combo" && chainsFrom !== undefined) {
    return { error: "Only a combo effect can chain from another card." };
  }
  if (!isPlayableCardChainKind(chainsFrom)) {
    return undefined;
  }
  return chainsFrom;
}

/**
 * Counts sentences by their ending punctuation. Trailing text without
 * punctuation counts as one more sentence.
 * @param text - Flavor text
 * @returns Number of sentences
 */
function countSentences(text: string): number {
  return text.split(/[.!?…]+(?:\s+|$)/).filter((part) => part.trim() !== "")
    .length;
}

/**
 * @param text - Player-facing rules text
 * @returns The first status-effect word found
 */
function findStatusWord(text: string): string | undefined {
  const normalized = text.toLowerCase();
  return PLAYABLE_CARD_STATUS_WORDS.find((word) => {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    return pattern.test(normalized);
  });
}

/**
 * @param value - Unknown JSON value
 * @returns Whether the value is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
