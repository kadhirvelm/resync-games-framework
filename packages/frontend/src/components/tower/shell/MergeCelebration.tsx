import { useEffect } from "react";
import type { CorebornTemplate, TierNumber } from "../logic/towerTypes";
import { GameCard } from "../parts/GameCard";
import { TierLeaves } from "../parts/TierLeaves";
import { UnitPortrait } from "../parts/UnitPortrait";
import styles from "./shell.module.scss";

/** Milliseconds the celebration stays before closing itself. */
const CELEBRATION_MS = 3200;

interface MergeCelebrationProps {
  onDone: () => void;
  template: CorebornTemplate;
  tier: TierNumber;
}

/**
 * A short full-screen moment when two Coreborn merge: the new portrait rises
 * inside a ring of light with its tier, title, and upgraded card. Closes on
 * click, on any key, or by itself.
 * @param onDone - Closes the celebration
 * @param template - Coreborn that merged
 * @param tier - Tier it reached
 * @returns The overlay
 */
export const MergeCelebration = ({
  onDone,
  template,
  tier,
}: MergeCelebrationProps) => {
  const reached = template.tiers[tier - 1];

  useEffect(() => {
    const timer = window.setTimeout(onDone, CELEBRATION_MS);
    window.addEventListener("keydown", onDone);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onDone);
    };
  }, [onDone]);

  return (
    <button
      aria-label={`${template.name} reached tier ${tier}. Continue.`}
      className={styles.celebration}
      onClick={onDone}
      type="button"
    >
      <span className={styles.celebrationRing}>
        <UnitPortrait
          accent="#c49a3a"
          name={template.name}
          size="large"
          url={reached?.portraitUrl}
        />
      </span>
      <span className={styles.celebrationText}>
        <span className={styles.celebrationEyebrow}>Merged</span>
        <strong>{template.name}</strong>
        <span>
          Tier {tier} · {reached?.title}
        </span>
        <TierLeaves tier={tier} />
      </span>
      {reached ? (
        <span className={styles.celebrationCard}>
          <GameCard card={reached.card} showFlavor={false} size="small" />
        </span>
      ) : null}
    </button>
  );
};
