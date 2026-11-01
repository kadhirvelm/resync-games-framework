import { MAX_TIER } from "../logic/towerTypes";
import styles from "../tower.module.scss";
import { LeafIcon } from "./LeafIcon";

/**
 * Four leaves that fill in as a Coreborn climbs tiers.
 * @param tier - Current tier from 1 through 4
 * @returns A row of tier pips with an accessible label
 */
export const TierLeaves = ({ tier }: { tier: number }) => (
  <span
    aria-label={`Tier ${tier} of ${MAX_TIER}`}
    className={styles.tierLeaves}
    role="img"
  >
    {Array.from({ length: MAX_TIER }, (_, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional and never reorder
      <LeafIcon filled={index < tier} key={index} size={14} />
    ))}
  </span>
);
