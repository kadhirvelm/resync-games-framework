import clsx from "clsx";
import type { RunState, TowerContent } from "../logic/towerTypes";
import { CorebornOffer } from "../parts/CorebornOffer";
import { LeafIcon } from "../parts/LeafIcon";
import { useChoiceFlourish } from "../parts/useChoiceFlourish";
import styles from "../tower.module.scss";
import { offeredTemplates, ownedTemplateCounts } from "./offerHelpers";

interface RecruitScreenProps {
  content: TowerContent;
  onRecruit: (templateId: string) => void;
  /** Recruit at once, without the celebration */
  reducedMotion: boolean;
  run: RunState;
}

/**
 * The opening draft. The tower's story sets the scene, then the player picks
 * the Coreborn who join before the first floor. Picking the same one twice
 * sets up an early merge.
 * @param content - Tower content
 * @param onRecruit - Recruits one Coreborn, after its pick celebrates
 * @param reducedMotion - Skip the celebration
 * @param run - Run in its recruit phase
 * @returns The draft screen
 */
export const RecruitScreen = ({
  content,
  onRecruit,
  reducedMotion,
  run,
}: RecruitScreenProps) => {
  const { choose, chosen } = useChoiceFlourish(reducedMotion);
  const offer =
    run.pendingReward?.kind === "coreborn" ? run.pendingReward.templateIds : [];
  const picked = run.stats.recruited;
  const totalPicks = picked + run.initialRecruits;
  const pickSlots = Array.from({ length: totalPicks }, (_, slot) => ({
    id: `pick-${slot}`,
    slot,
  }));
  return (
    <main className={styles.screen}>
      <header className={styles.storyHeader}>
        <p className={styles.eyebrow}>{content.title}</p>
        <h1>Before the climb</h1>
        <p className={styles.story}>{content.summary}</p>
      </header>
      <section className={styles.panel}>
        <div className={styles.panelHeaderRow}>
          <h2>
            Choose {run.initialRecruits}{" "}
            {run.initialRecruits === 1 && picked > 0
              ? "more Coreborn"
              : "Coreborn"}{" "}
            to join you
          </h2>
          <span
            aria-label={`${picked} of ${totalPicks} chosen`}
            className={styles.pickLeaves}
            role="img"
          >
            {pickSlots.map(({ id, slot }) => (
              <LeafIcon
                className={clsx(slot === picked && styles.pickLeafNext)}
                filled={slot < picked}
                key={id}
                size={22}
              />
            ))}
          </span>
        </div>
        <p className={styles.muted}>
          Every Coreborn brings two copies of its tier 1 card and steps in at
          the front of the party. You may recruit the same one twice to merge it
          before the first battle.
        </p>
        <CorebornOffer
          chosenId={chosen}
          onRecruit={(templateId) =>
            choose(templateId, () => onRecruit(templateId))
          }
          ownedCounts={ownedTemplateCounts(run)}
          templates={offeredTemplates(content, offer)}
        />
      </section>
    </main>
  );
};
