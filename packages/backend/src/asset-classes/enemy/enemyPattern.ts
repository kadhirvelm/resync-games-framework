import { ENEMY_ACTION_KINDS } from "@resync-game-framework/api";
import { z } from "zod";
import {
  PLAYABLE_CARD_EFFECT_AMOUNTS,
  PLAYABLE_CARD_STATUS_WORDS,
} from "../playable-card/playableCardSpec";

/** How many actions an enemy cycle contains. */
export const ENEMY_PATTERN_LENGTH = { max: 4, min: 2 } as const;

/** Player-facing length of one action's rules text. */
export const ENEMY_ACTION_TEXT = { max: 160, min: 8 } as const;

const enemyActionTextSchema = z
  .string()
  .trim()
  .min(ENEMY_ACTION_TEXT.min)
  .max(ENEMY_ACTION_TEXT.max)
  .refine((text) => findStatusWord(text) === undefined, {
    message:
      "Action text cannot include a status effect. Status effects are out of scope.",
  })
  .describe(
    "Rules text the player reads. State the amount. No status effects.",
  );

/**
 * One attack or defend step, using the playable-card amount for that kind.
 */
export const enemyActionSchema = z
  .object({
    amount: z
      .number()
      .int()
      .describe(
        `Damage or block. Attack is ${PLAYABLE_CARD_EFFECT_AMOUNTS.attack.min} to ${PLAYABLE_CARD_EFFECT_AMOUNTS.attack.max}. Defend is ${PLAYABLE_CARD_EFFECT_AMOUNTS.defend.min} to ${PLAYABLE_CARD_EFFECT_AMOUNTS.defend.max}.`,
      ),
    kind: z
      .enum(ENEMY_ACTION_KINDS)
      .describe(
        "attack deals damage to the player. defend gains block. These are the playable-card kinds an enemy can take.",
      ),
    text: enemyActionTextSchema,
  })
  .superRefine((action, context) => {
    const range = PLAYABLE_CARD_EFFECT_AMOUNTS[action.kind];
    if (action.amount >= range.min && action.amount <= range.max) {
      return;
    }
    context.addIssue({
      code: "custom",
      message: `${action.kind} amount must be from ${range.min} to ${range.max}.`,
      path: ["amount"],
    });
  });

/**
 * The enemy's attack cycle.
 * Battle takes these actions in order, then starts again at the first.
 */
export const enemyPatternSchema = z
  .array(enemyActionSchema)
  .min(ENEMY_PATTERN_LENGTH.min)
  .max(ENEMY_PATTERN_LENGTH.max)
  .describe(
    `${ENEMY_PATTERN_LENGTH.min} to ${ENEMY_PATTERN_LENGTH.max} attack or defend actions. The enemy takes them in order, then repeats from the first.`,
  );

/**
 * @param text - Player-facing rules text
 * @returns The first status-effect word found
 */
function findStatusWord(text: string): string | undefined {
  return PLAYABLE_CARD_STATUS_WORDS.find((word) => {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    return pattern.test(text);
  });
}
