import clsx from "clsx";
import { Heart } from "lucide-react";
import { tierHitPoints } from "../logic/characterRoles";
import type { CorebornRole, CorebornTemplate } from "../logic/towerTypes";
import styles from "../tower.module.scss";
import { Burst } from "./Burst";
import { Button } from "./Button";
import { GameCard } from "./GameCard";
import { UnitPortrait } from "./UnitPortrait";

/** Player-facing name for each role. */
export const ROLE_LABELS: Record<CorebornRole, string> = {
  guardian: "Guardian",
  mender: "Mender",
  mystic: "Mystic",
  striker: "Striker",
};

interface CorebornOfferProps {
  /** Template being recruited right now; it bursts and the rest fall away */
  chosenId?: string;
  /** Copies of each template already in the party */
  ownedCounts: Map<string, number>;
  onRecruit: (templateId: string) => void;
  templates: CorebornTemplate[];
}

/**
 * Coreborn the player can recruit, each with its full card progression so
 * the pick is informed: the tier 1 card joins now, merges unlock the rest.
 * One already in the party glows gold, since a second copy can merge.
 * @param chosenId - Template being recruited, while its pick celebrates
 * @param ownedCounts - Copies already in the party, keyed by template id
 * @param onRecruit - Called with the chosen template id
 * @param templates - Coreborn on offer
 * @returns One panel per Coreborn
 */
export const CorebornOffer = ({
  chosenId,
  ownedCounts,
  onRecruit,
  templates,
}: CorebornOfferProps) => (
  <div className={styles.offerList}>
    {templates.map((template) => {
      const owned = ownedCounts.get(template.id) ?? 0;
      const firstTier = template.tiers[0];
      return (
        <article
          className={clsx(
            styles.offer,
            owned > 0 && styles.offerMergeable,
            chosenId === template.id && styles.offerChosen,
            chosenId !== undefined &&
              chosenId !== template.id &&
              styles.offerDismissed,
          )}
          key={template.id}
        >
          {chosenId === template.id ? <Burst count={24} reach={220} /> : null}
          <header className={styles.offerHeader}>
            <UnitPortrait
              accent="#4e8f6a"
              name={template.name}
              size="large"
              url={firstTier?.portraitUrl}
            />
            <div className={styles.offerIdentity}>
              <h3>{template.name}</h3>
              <p className={styles.offerMeta}>
                <span className={styles.roleTag}>
                  {ROLE_LABELS[template.role]}
                </span>
                <span>
                  <Heart size={13} /> {tierHitPoints(template.baseHitPoints, 1)}
                </span>
                {owned > 0 ? (
                  <span className={styles.ownedTag}>
                    In party ×{owned} · recruit again to merge
                  </span>
                ) : null}
              </p>
              <p className={styles.offerLore}>{template.description}</p>
            </div>
          </header>
          <div className={styles.tierStrip}>
            {template.tiers.map((tier) => (
              <div className={styles.tierStep} key={tier.tier}>
                <span className={styles.tierStepLabel}>
                  Tier {tier.tier} · {tier.title}
                </span>
                <GameCard
                  card={tier.card}
                  highlighted={tier.tier === 1}
                  showFlavor={false}
                  size="small"
                />
              </div>
            ))}
          </div>
          <Button
            disabled={chosenId !== undefined}
            onClick={() => onRecruit(template.id)}
          >
            Recruit {template.name}
          </Button>
        </article>
      );
    })}
  </div>
);
