import type { EnemyAction } from "@resync-game-framework/api";
import type {
  EnemyMove,
  EnemyTargetPattern,
  EnemyTemplate,
} from "./towerTypes";

/** Attack words that read as hitting the whole party. */
const ALL_TARGET_WORDS =
  /\b(all|every|everyone|sweep\w*|wave|slam\w*|burst\w*|storm\w*|quake\w*|roar\w*|nova|cleave\w*|shockwave|tide|flood\w*|rain\w*|scatter\w*)\b/i;

/** Attack words that read as reaching past the front line. */
const BACK_TARGET_WORDS =
  /\b(lung(?:e\w*|ing)|leap\w*|pounce\w*|snipe\w*|flank\w*|pierc\w*|dive\w*|diving|ambush\w*|behind|arrow\w*|shot|shoot\w*|stalk\w*|straggler\w*|reach\w*|vault\w*)\b/i;

/** Party-wide attacks deal this share of the listed damage to each target. */
export const ALL_TARGET_DAMAGE_SHARE = 0.6;

/**
 * Reads who an attack should hit from its generated text.
 * Enemies always act in a fixed order, so the pattern is part of the telegraph.
 * @param text - Generated action text, such as "Low lunging strike"
 * @returns Front by default, back for reaching attacks, all for sweeping ones
 */
export function inferTargetPattern(text: string): EnemyTargetPattern {
  if (ALL_TARGET_WORDS.test(text)) {
    return "all";
  }
  if (BACK_TARGET_WORDS.test(text)) {
    return "back";
  }
  return "front";
}

/**
 * Turns a generated attack cycle into moves with target patterns.
 * Party-wide attacks are softened so they do not triple their damage.
 * An empty cycle gets a plain strike, guard, heavy strike loop.
 * @param pattern - Cycle stored on the enemy asset
 * @param maxHitPoints - Enemy health, used to size the fallback cycle
 * @returns Moves in cycle order
 */
export function toEnemyMoves(
  pattern: readonly EnemyAction[],
  maxHitPoints: number,
): EnemyMove[] {
  if (pattern.length === 0) {
    return fallbackMoves(maxHitPoints);
  }
  return pattern.map((action) => {
    if (action.kind === "defend") {
      return { ...action, target: "front" };
    }
    const target = inferTargetPattern(action.text);
    const amount =
      target === "all"
        ? Math.max(1, Math.round(action.amount * ALL_TARGET_DAMAGE_SHARE))
        : action.amount;
    return {
      amount,
      kind: "attack",
      target,
      text: replaceFirstNumber(action.text, action.amount, amount),
    };
  });
}

/**
 * @param maxHitPoints - Enemy health
 * @returns A three-step cycle sized from the enemy's health
 */
function fallbackMoves(maxHitPoints: number): EnemyMove[] {
  const base = Math.max(4, Math.round(maxHitPoints / 6));
  return [
    {
      amount: base,
      kind: "attack",
      target: "front",
      text: `Strike: Deal ${base} damage.`,
    },
    {
      amount: base,
      kind: "defend",
      target: "front",
      text: `Brace: Gain ${base} block.`,
    },
    {
      amount: Math.round(base * 1.5),
      kind: "attack",
      target: "front",
      text: `Heavy blow: Deal ${Math.round(base * 1.5)} damage.`,
    },
  ];
}

/** Health and damage a floor wants from one enemy. */
export interface EnemyScaleTarget {
  /** Average damage of its attacks after scaling */
  attack: number;
  hitPoints: number;
}

/**
 * Rescales an enemy so every tower plays at the same difficulty no matter
 * what numbers the generator picked. The cycle's shape is kept: a heavy
 * blow stays heavier than a quick bite.
 * @param template - Enemy as generated
 * @param target - Health and average attack for this floor
 * @returns Health and moves for this floor
 */
export function scaleEnemy(
  template: EnemyTemplate,
  target: EnemyScaleTarget,
): { maxHitPoints: number; moves: EnemyMove[] } {
  const attacks = template.moves.filter((move) => move.kind === "attack");
  const averageAttack =
    attacks.reduce((sum, move) => sum + move.amount, 0) /
    Math.max(1, attacks.length);
  const factor = averageAttack > 0 ? target.attack / averageAttack : 1;
  return {
    maxHitPoints: Math.max(1, Math.round(target.hitPoints)),
    moves: template.moves.map((move) => {
      const amount = Math.max(1, Math.round(move.amount * factor));
      return {
        ...move,
        amount,
        text: replaceFirstNumber(move.text, move.amount, amount),
      };
    }),
  };
}

/**
 * @param text - Action text that may repeat the amount
 * @param previous - Amount written in the text
 * @param next - Amount to write instead
 * @returns Updated text
 */
function replaceFirstNumber(
  text: string,
  previous: number,
  next: number,
): string {
  const pattern = new RegExp(`\\b${previous}\\b`);
  return text.replace(pattern, String(next));
}

/**
 * Short label for a telegraphed target.
 * @param target - Target pattern
 * @returns Words drawn under the intent
 */
export function describeTarget(target: EnemyTargetPattern): string {
  if (target === "all") {
    return "whole party";
  }
  if (target === "back") {
    return "back line";
  }
  return "front line";
}
