import clsx from "clsx";
import { LeafIcon } from "../parts/LeafIcon";
import type { CurtainState } from "../useCurtain";
import styles from "./shell.module.scss";

/**
 * Full-screen paper wash drawn over scene changes: it blooms outward from
 * the middle like ink, holds with a turning leaf, then lifts and fades.
 * It never blocks input while open.
 * @param durationMs - Fade time in milliseconds
 * @param state - Where the fade is in its cycle
 * @returns The curtain overlay
 */
export const Curtain = ({
  durationMs,
  state,
}: {
  durationMs: number;
  state: CurtainState;
}) => (
  <div
    aria-hidden="true"
    className={clsx(
      styles.curtain,
      state === "closing" && styles.curtainShut,
      state === "opening" && styles.curtainLifting,
    )}
    style={{ "--curtain-ms": `${durationMs}ms` } as React.CSSProperties}
  >
    <span className={styles.curtainInk} />
    <LeafIcon className={styles.curtainLeaf} size={44} />
  </div>
);
