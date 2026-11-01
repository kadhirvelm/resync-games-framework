import clsx from "clsx";
import { MAX_TIER } from "../logic/towerTypes";
import styles from "../tower.module.scss";
import { LeafIcon } from "./LeafIcon";

/**
 * Four leaves that fill in as a Coreborn climbs tiers.
 * @param popIn - Grow the leaves in one after another, for a celebration
 * @param size - Leaf size in pixels. Defaults to 14
 * @param tier - Current tier from 1 through 4
 * @returns A row of tier pips with an accessible label
 */
export const TierLeaves = ({
  popIn = false,
  size = 14,
  tier,
}: {
  popIn?: boolean;
  size?: number;
  tier: number;
}) => (
  <span
    aria-label={`Tier ${tier} of ${MAX_TIER}`}
    className={clsx(styles.tierLeaves, popIn && styles.tierLeavesPop)}
    role="img"
  >
    {Array.from({ length: MAX_TIER }, (_, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional and never reorder
      <LeafIcon filled={index < tier} key={index} size={size} />
    ))}
  </span>
);
