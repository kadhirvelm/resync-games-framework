import clsx from "clsx";
import { Crown, Gem, Leaf, Mountain, Unlock } from "lucide-react";
import type { ClimbSummary, EssenceBreakdown } from "../logic/progression";
import type { RunState, TowerContent } from "../logic/towerTypes";
import { Button } from "../parts/Button";
import { PartyLineup } from "../parts/PartyLineup";
import { useCountUp } from "../shell/countUp";
import { ascensionNumeral } from "../shell/formatTime";
import styles from "../tower.module.scss";

interface RunEndScreenProps {
  content: TowerContent;
  onCultivate: () => void;
  onQuit: () => void;
  onRestart: () => void;
  reducedMotion: boolean;
  run: RunState;
  /** What the climb earned. Missing for the moment before it is banked. */
  summary?: ClimbSummary;
}

/** Tally lines, in the order they count up. */
const TALLY_LINES: { key: keyof EssenceBreakdown; label: string }[] = [
  { key: "floors", label: "Floors cleared" },
  { key: "victory", label: "Tower Heart quieted" },
  { key: "merges", label: "Merges" },
  { key: "recruits", label: "Coreborn recruited" },
  { key: "ascensionBonus", label: "Ascension bonus" },
];

/**
 * One line of the essence tally, counting up in turn.
 * @param label - What earned it
 * @param order - Position in the tally, which staggers the count
 * @param reducedMotion - Show the final value at once
 * @param value - Essence from this source
 * @returns The tally row
 */
const TallyLine = ({
  label,
  order,
  reducedMotion,
  value,
}: {
  label: string;
  order: number;
  reducedMotion: boolean;
  value: number;
}) => {
  const shown = useCountUp(value, {
    delay: 500 + order * 260,
    duration: 700,
    instant: reducedMotion,
  });
  return (
    <div
      className={styles.tallyLine}
      style={{ "--i": order + 2 } as React.CSSProperties}
    >
      <dt>{label}</dt>
      <dd>+{shown}</dd>
    </div>
  );
};

/**
 * The end of a climb: the crown at the summit, or the floor where the
 * cultivator fell. The essence it earned counts up, along with any new
 * record or unlocked ascension.
 * @param props - Finished run, what it earned, and where to go next
 * @returns The end screen
 */
export const RunEndScreen = ({
  content,
  onCultivate,
  onQuit,
  onRestart,
  reducedMotion,
  run,
  summary,
}: RunEndScreenProps) => {
  const victory = run.phase === "victory";
  const floor = run.floorIndex + 1;
  const lines = summary
    ? TALLY_LINES.filter((line) => summary.essence[line.key] > 0)
    : [];
  const total = useCountUp(summary?.essence.total ?? 0, {
    delay: 500 + lines.length * 260,
    duration: 900,
    instant: reducedMotion,
  });

  return (
    <main className={clsx(styles.screen, styles.endScreen)}>
      <header
        className={clsx(
          styles.storyHeader,
          victory ? styles.endVictory : styles.endDefeat,
        )}
      >
        <span className={styles.endEmblem}>
          {victory ? <Crown size={44} /> : <Leaf size={44} />}
        </span>
        <p className={styles.eyebrow}>
          {content.title}
          {run.ascension > 0
            ? ` · Ascension ${ascensionNumeral(run.ascension)}`
            : ""}
        </p>
        <h1>
          {victory
            ? "The Tower Heart is quiet"
            : `The climb ends on floor ${floor}`}
        </h1>
        <p className={styles.story}>
          {victory
            ? "The summit is still. Leaves settle on the shrine, and the tower lets out a long breath of green. Your party stands where no climber has stood in an age."
            : "The cultivator falls and the tower keeps its secrets. The Coreborn return to the wild, but what you learned stays with you as Jade Essence."}
        </p>
      </header>

      {summary ? (
        <section className={clsx(styles.panel, styles.tallyPanel)}>
          <h2>
            <Gem size={20} /> Jade Essence
          </h2>
          <dl className={styles.tally}>
            {lines.map((line, index) => (
              <TallyLine
                key={line.key}
                label={line.label}
                order={index}
                reducedMotion={reducedMotion}
                value={summary.essence[line.key]}
              />
            ))}
            <div className={styles.tallyTotal}>
              <dt>Total</dt>
              <dd>{total}</dd>
            </div>
          </dl>
          {summary.newBestFloor || summary.unlockedAscension !== undefined ? (
            <div className={styles.badges}>
              {summary.newBestFloor ? (
                <span className={styles.badge}>
                  <Mountain size={14} /> New best floor
                </span>
              ) : null}
              {summary.unlockedAscension === undefined ? null : (
                <span className={clsx(styles.badge, styles.badgeGold)}>
                  <Unlock size={14} /> Ascension{" "}
                  {ascensionNumeral(summary.unlockedAscension)} unlocked
                </span>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

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
        {victory ? (
          <PartyLineup content={content} reducedMotion={true} run={run} />
        ) : null}
      </section>

      <div className={styles.endActions}>
        <Button className={styles.bigButton} onClick={onRestart}>
          Climb again
        </Button>
        <Button onClick={onCultivate} variant="quiet">
          <Gem size={16} /> Cultivate
        </Button>
        <Button onClick={onQuit} variant="quiet">
          Return to title
        </Button>
      </div>
    </main>
  );
};
