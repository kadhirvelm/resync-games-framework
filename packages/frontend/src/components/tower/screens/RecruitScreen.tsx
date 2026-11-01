import type { RunState, TowerContent } from "../logic/towerTypes";
import { CorebornOffer } from "../parts/CorebornOffer";
import styles from "../tower.module.scss";
import { offeredTemplates, ownedTemplateCounts } from "./offerHelpers";

interface RecruitScreenProps {
  content: TowerContent;
  onRecruit: (templateId: string) => void;
  run: RunState;
}

/**
 * The opening draft. The tower's story sets the scene, then the player picks
 * the Coreborn who join before the first floor. Picking the same one twice
 * sets up an early merge.
 * @param content - Tower content
 * @param onRecruit - Recruits one Coreborn
 * @param run - Run in its recruit phase
 * @returns The draft screen
 */
export const RecruitScreen = ({
  content,
  onRecruit,
  run,
}: RecruitScreenProps) => {
  const offer =
    run.pendingReward?.kind === "coreborn" ? run.pendingReward.templateIds : [];
  return (
    <main className={styles.screen}>
      <header className={styles.storyHeader}>
        <p className={styles.eyebrow}>{content.title}</p>
        <h1>Before the climb</h1>
        <p className={styles.story}>{content.summary}</p>
      </header>
      <section className={styles.panel}>
        <h2>
          Choose {run.initialRecruits}{" "}
          {run.initialRecruits === 1 ? "Coreborn" : "more Coreborn"} to join you
        </h2>
        <p className={styles.muted}>
          Every Coreborn brings two copies of its tier 1 card and steps in at
          the front of the party. You may recruit the same one twice to merge it
          before the first battle.
        </p>
        <CorebornOffer
          onRecruit={onRecruit}
          ownedCounts={ownedTemplateCounts(run)}
          templates={offeredTemplates(content, offer)}
        />
      </section>
    </main>
  );
};
