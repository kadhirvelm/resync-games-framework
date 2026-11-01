import clsx from "clsx";
import { useMemo } from "react";
import styles from "../tower.module.scss";
import { burstParticles } from "./particles";

/** Burst colors: lantern gold, jade glow, gold, jade, and paper. */
const PALETTE = ["#f0d78c", "#7fd1a4", "#c49a3a", "#4e8f6a", "#fffdf6"];

interface BurstProps {
  className?: string;
  /** Particles in the ring */
  count?: number;
  /** Longest flight in pixels */
  reach?: number;
  /** Varies the layout between bursts */
  seed?: number;
}

/**
 * A ring of leaves and sparks thrown out from the center of its parent,
 * with a flash of light behind them. Plays once on mount; give it a new
 * `key` to play again. The parent needs a position other than static.
 * Purely decorative and hidden from assistive technology.
 * @param className - Extra class for placement
 * @param count - Particles in the ring. Defaults to 18
 * @param reach - Longest flight in pixels. Defaults to 160
 * @param seed - Layout seed
 * @returns The burst layer
 */
export const Burst = ({
  className,
  count = 18,
  reach = 160,
  seed = 0,
}: BurstProps) => {
  const particles = useMemo(
    () =>
      burstParticles(count, {
        maxDistance: reach,
        minDistance: reach * 0.45,
        palette: PALETTE.length,
        seed,
      }),
    [count, reach, seed],
  );
  return (
    <span aria-hidden="true" className={clsx(styles.burst, className)}>
      <span className={styles.burstFlash} />
      {particles.map((particle, index) => (
        <span
          className={index % 3 === 0 ? styles.burstSpark : styles.burstLeaf}
          // biome-ignore lint/suspicious/noArrayIndexKey: decorative particles never reorder
          key={index}
          style={
            {
              "--angle": `${particle.angle}deg`,
              "--color": PALETTE[particle.colorIndex],
              "--delay": `${particle.delay}ms`,
              "--distance": `${particle.distance}px`,
              "--size": `${particle.size}px`,
              "--spin": `${particle.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
};
