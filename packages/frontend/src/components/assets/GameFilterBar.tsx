import styles from "./Assets.module.scss";
import type { AssetGameId, AssetGameTag } from "./assetGameTags";

interface GameFilterBarProps {
  /** Active game filter, or `"all"` for every asset. */
  activeGameId: AssetGameId | "all";
  /** Available game tags present in the current list. */
  availableTags: readonly AssetGameTag[];
  /** Called when the user picks a game filter pill. */
  onChange: (gameId: AssetGameId | "all") => void;
}

/**
 * Compact pill bar for filtering a multi-game asset library by game.
 * @param props - Active filter, available games, and change handler
 * @returns Filter pills, or null when fewer than two games are represented
 */
export function GameFilterBar({
  activeGameId,
  availableTags,
  onChange,
}: GameFilterBarProps) {
  if (availableTags.length === 0) {
    return null;
  }

  return (
    <fieldset
      aria-label="Filter by game"
      className={styles.gameFilterBar}
      style={{ border: 0, margin: 0, padding: 0 }}
    >
      <button
        aria-pressed={activeGameId === "all"}
        className={styles.gameFilterPill}
        data-active={activeGameId === "all" ? "true" : undefined}
        onClick={() => onChange("all")}
        type="button"
      >
        All games
      </button>
      {availableTags.map((tag) => (
        <button
          aria-pressed={activeGameId === tag.id}
          className={styles.gameFilterPill}
          data-active={activeGameId === tag.id ? "true" : undefined}
          key={tag.id}
          onClick={() => onChange(tag.id)}
          type="button"
        >
          <span
            aria-hidden="true"
            className={styles.gameTagDot}
            style={{ backgroundColor: tag.accent }}
          />
          {tag.label}
        </button>
      ))}
    </fieldset>
  );
}
