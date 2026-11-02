import type { EnemyAction } from "@resync-game-framework/api";
import styles from "./Assets.module.scss";

interface EnemyPatternProps {
  /** Actions in the order the enemy repeats. */
  pattern: readonly EnemyAction[];
}

/**
 * Compact cycle shown on an enemy tile, such as "Attack 6 → Defend 8".
 * @param pattern - Actions in the order the enemy repeats
 * @returns The cycle as one line
 */
export function EnemyPatternSummary({ pattern }: EnemyPatternProps) {
  return (
    <span className={styles.enemyPattern}>
      {pattern.map((action) => formatEnemyAction(action)).join(" → ")}
    </span>
  );
}

/**
 * Rules lines for an opened enemy, in cycle order.
 * @param pattern - Actions in the order the enemy repeats
 * @returns An ordered list of the rules text
 */
export function EnemyPatternDetail({ pattern }: EnemyPatternProps) {
  return (
    <ol className={styles.enemyPatternList}>
      {keyedActions(pattern).map((step) => (
        <li key={step.key}>{step.action.text}</li>
      ))}
    </ol>
  );
}

/**
 * Gives each cycle step a stable key, including repeated actions.
 * @param pattern - Actions in the order the enemy repeats
 * @returns The same actions paired with unique keys
 */
function keyedActions(
  pattern: readonly EnemyAction[],
): Array<{ action: EnemyAction; key: string }> {
  const seen = new Map<string, number>();
  return pattern.map((action) => {
    const base = `${action.kind}:${action.amount}:${action.text}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { action, key: `${base}#${count}` };
  });
}

/**
 * @param action - One step in the enemy cycle
 * @returns A short label such as "Attack 6"
 */
function formatEnemyAction(action: EnemyAction): string {
  const label = action.kind === "attack" ? "Attack" : "Defend";
  return `${label} ${action.amount}`;
}
