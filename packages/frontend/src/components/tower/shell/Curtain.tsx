import clsx from "clsx";
import { LeafIcon } from "../parts/LeafIcon";
import type { CurtainState } from "../useCurtain";
import styles from "./shell.module.scss";

/**
 * Full-screen paper fade drawn over scene changes, with a turning leaf while
 * it is closed. It never blocks input while open.
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
    className={clsx(styles.curtain, state === "closing" && styles.curtainShut)}
    style={{ "--curtain-ms": `${durationMs}ms` } as React.CSSProperties}
  >
    <LeafIcon className={styles.curtainLeaf} size={44} />
  </div>
);
