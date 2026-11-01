import { useMemo } from "react";
import styles from "../tower.module.scss";
import { rainParticles } from "./particles";

/** Rain colors: gold, lantern gold, jade, and jade glow. */
const PALETTE = ["#c49a3a", "#f0d78c", "#4e8f6a", "#7fd1a4"];

/**
 * Gold and jade leaves tumbling down the whole screen, for a summit
 * victory. It never takes pointer input and is hidden from assistive
 * technology.
 * @param count - Leaves in the rain. Defaults to 46
 * @returns A fixed, full-screen layer
 */
export const LeafRain = ({ count = 46 }: { count?: number }) => {
  const leaves = useMemo(() => rainParticles(count, PALETTE.length), [count]);
  return (
    <div aria-hidden="true" className={styles.leafRain}>
      {leaves.map((leaf, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: decorative particles never reorder
          key={index}
          style={
            {
              "--color": PALETTE[leaf.colorIndex],
              "--delay": `${leaf.delay}s`,
              "--drift": `${leaf.drift}vw`,
              "--duration": `${leaf.duration}s`,
              "--size": `${leaf.size}px`,
              "--spin": `${leaf.spin}deg`,
              "--x": `${leaf.x}vw`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};
