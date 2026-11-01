import { ArrowRight } from "lucide-react";
import { findTemplate, type MergePair } from "../logic/run";
import type { TowerContent } from "../logic/towerTypes";
import styles from "../tower.module.scss";
import { Button } from "./Button";
import { GameCard } from "./GameCard";
import { UnitPortrait } from "./UnitPortrait";

interface MergePanelProps {
  content: TowerContent;
  onMerge: (pair: MergePair) => void;
  pairs: MergePair[];
}

/**
 * Merges the party can make right now, each showing the card swap it causes.
 * @param content - Tower content
 * @param onMerge - Performs one merge
 * @param pairs - Available merges
 * @returns The merge list, or nothing when no merge is possible
 */
export const MergePanel = ({ content, onMerge, pairs }: MergePanelProps) => {
  if (pairs.length === 0) {
    return null;
  }
  return (
    <section className={styles.panel}>
      <h2>Merge Coreborn</h2>
      <p className={styles.muted}>
        Two copies become one stronger Coreborn at full health. Their cards
        leave the deck and the upgraded card takes their place, so merging also
        thins the deck.
      </p>
      <div className={styles.mergeList}>
        {pairs.map((pair) => {
          const template = findTemplate(content, pair.templateId);
          const before = template?.tiers[pair.resultTier - 2];
          const after = template?.tiers[pair.resultTier - 1];
          if (!template || !before || !after) {
            return null;
          }
          return (
            <article className={styles.merge} key={pair.keepId}>
              <UnitPortrait
                accent="#4e8f6a"
                name={template.name}
                size="small"
                url={after.portraitUrl}
              />
              <div className={styles.mergeText}>
                <h3>{template.name}</h3>
                <p>
                  Tier {pair.resultTier} · {after.title}
                </p>
              </div>
              <div className={styles.mergeCards}>
                <GameCard card={before.card} showFlavor={false} size="small" />
                <ArrowRight aria-label="becomes" size={20} />
                <GameCard
                  card={after.card}
                  highlighted={true}
                  showFlavor={false}
                  size="small"
                />
              </div>
              <Button onClick={() => onMerge(pair)}>Merge</Button>
            </article>
          );
        })}
      </div>
    </section>
  );
};
