import { Crown, Leaf } from "lucide-react";
import type { RunState, TowerContent } from "../logic/towerTypes";
import { Button } from "../parts/Button";
import { PartyLineup } from "../parts/PartyLineup";
import styles from "../tower.module.scss";

interface RunEndScreenProps {
  content: TowerContent;
  onQuit: () => void;
  onRestart: () => void;
  run: RunState;
}

/**
 * The end of a climb: the crown at the summit, or the floor where the
 * cultivator fell. Nothing carries into the next run.
 * @param content - Tower content
 * @param onQuit - Returns to the tower list
 * @param onRestart - Climbs the same tower again from the start
 * @param run - Finished run
 * @returns The end screen
 */
export const RunEndScreen = ({
  content,
  onQuit,
  onRestart,
  run,
}: RunEndScreenProps) => {
  const victory = run.phase === "victory";
  const floor = run.floorIndex + 1;
  return (
    <main className={styles.screen}>
      <header className={styles.storyHeader}>
        {victory ? (
          <Crown className={styles.endIcon} size={48} />
        ) : (
          <Leaf className={styles.endIcon} size={48} />
        )}
        <p className={styles.eyebrow}>{content.title}</p>
        <h1>
          {victory
            ? "The Tower Heart is quiet"
            : `The climb ends on floor ${floor}`}
        </h1>
        <p className={styles.story}>
          {victory
            ? "The summit is still. Leaves settle on the shrine, and the tower lets out a long breath of green. Your party stands where no climber has stood in an age."
            : "The cultivator falls and the tower keeps its secrets. Every Coreborn returns to the wild, and the next climb begins with nothing but the jade path."}
        </p>
      </header>
      <section className={styles.panel}>
        <h2>{victory ? "Crowned at the summit" : "This climb"}</h2>
        <dl className={styles.stats}>
          <div>
            <dt>Floors cleared</dt>
            <dd>{run.stats.battlesWon}</dd>
          </div>
          <div>
            <dt>Coreborn recruited</dt>
            <dd>{run.stats.recruited}</dd>
          </div>
          <div>
            <dt>Merges</dt>
            <dd>{run.stats.merges}</dd>
          </div>
          <div>
            <dt>Coreborn lost</dt>
            <dd>{run.stats.corebornLost.length}</dd>
          </div>
        </dl>
        {run.stats.corebornLost.length > 0 ? (
          <p className={styles.muted}>
            Fallen: {run.stats.corebornLost.join(", ")}
          </p>
        ) : null}
        {victory ? <PartyLineup content={content} run={run} /> : null}
        <div className={styles.endActions}>
          <Button onClick={onRestart}>Climb again</Button>
          <Button onClick={onQuit} variant="quiet">
            Choose another tower
          </Button>
        </div>
      </section>
    </main>
  );
};
