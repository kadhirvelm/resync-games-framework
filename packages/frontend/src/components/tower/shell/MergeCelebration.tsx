import { useEffect } from "react";
import type { CorebornTemplate, TierNumber } from "../logic/towerTypes";
import { Burst } from "../parts/Burst";
import { GameCard } from "../parts/GameCard";
import { TierLeaves } from "../parts/TierLeaves";
import { UnitPortrait } from "../parts/UnitPortrait";
import { useStaggeredSounds } from "../parts/useStaggeredSounds";
import styles from "./shell.module.scss";

/** Milliseconds the celebration stays before closing itself. */
const CELEBRATION_MS = 3800;

/** When the first tier leaf pops in, and the gap to the next. */
const LEAF_START_MS = 650;
const LEAF_STEP_MS = 170;

interface MergeCelebrationProps {
  onDone: () => void;
  /** Leave out the light show and its chimes */
  reducedMotion: boolean;
  template: CorebornTemplate;
  tier: TierNumber;
}

/**
 * A full-screen moment when two Coreborn merge: rays of light turn behind
 * the new portrait, leaves burst outward, and its tier leaves pop in one at
 * a time with rising chimes before the upgraded card rises. Closes on click,
 * on any key, or by itself.
 * @param onDone - Closes the celebration
 * @param reducedMotion - Skip the rays, burst, and chimes
 * @param template - Coreborn that merged
 * @param tier - Tier it reached
 * @returns The overlay
 */
export const MergeCelebration = ({
  onDone,
  reducedMotion,
  template,
  tier,
}: MergeCelebrationProps) => {
  const reached = template.tiers[tier - 1];
  useStaggeredSounds(
    "sparkle",
    reducedMotion ? 0 : tier,
    { pitchStep: 0.12, startMs: LEAF_START_MS, stepMs: LEAF_STEP_MS },
    `${template.id}:${tier}`,
  );

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
      {reducedMotion ? null : (
        <span aria-hidden="true" className={styles.celebrationRays} />
      )}
      <span className={styles.celebrationRing}>
        <UnitPortrait
          accent="#c49a3a"
          name={template.name}
          size="large"
          url={reached?.portraitUrl}
        />
        {reducedMotion ? null : <Burst count={30} reach={260} />}
      </span>
      <span className={styles.celebrationText}>
        <span className={styles.celebrationEyebrow}>Merged · Tier up</span>
        <strong>{template.name}</strong>
        <span>
          Tier {tier} · {reached?.title}
        </span>
        <TierLeaves popIn={!reducedMotion} size={26} tier={tier} />
      </span>
      {reached ? (
        <span className={styles.celebrationCard}>
          <GameCard card={reached.card} showFlavor={false} size="small" />
        </span>
      ) : null}
      <span className={styles.celebrationHint}>Click or press any key</span>
    </button>
  );
};
