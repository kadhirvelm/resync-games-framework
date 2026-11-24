import styles from "./Assets.module.scss";
import type { AssetGameTag } from "./assetGameTags";

interface GameTagListProps {
  /** Shown as a muted pill when no specific game matched. */
  fallbackLabel?: string;
  tags: readonly AssetGameTag[];
}

/**
 * Renders pill badges showing which games use an asset.
 * @param props - Game tags and optional fallback label
 * @returns A row of pill tags, or null when empty without a fallback
 */
export function GameTagList({ fallbackLabel, tags }: GameTagListProps) {
  if (tags.length === 0 && fallbackLabel === undefined) {
    return null;
  }

  return (
    <div className={styles.gameTagRow}>
      {tags.length > 0 ? (
        tags.map((tag) => (
          <span className={styles.gameTag} key={tag.id}>
            <span
              aria-hidden="true"
              className={styles.gameTagDot}
              style={{ backgroundColor: tag.accent }}
            />
            {tag.label}
          </span>
        ))
      ) : (
        <span className={styles.gameTagMuted}>{fallbackLabel}</span>
      )}
    </div>
  );
}
