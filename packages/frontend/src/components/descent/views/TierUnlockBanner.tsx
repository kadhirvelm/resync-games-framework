/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HoldTier } from "../logic/economy/model";
import styles from "./tierUnlockBanner.module.scss";
import {
  didHoldTierAdvance,
  type TierUnlockSummary,
  tierUnlockSummary,
} from "./tierUnlocks";

/** How long the tier-up unlock banner stays visible before auto-dismissing. */
export const TIER_UNLOCK_BANNER_MS = 8_000;

/**
 * Non-blocking toast/banner that announces a Hold tier upgrade and lists the
 * newly unlocked units and buildings. Never fires on initial mount (including
 * loading a save already at a higher tier).
 * @param props - Current Hold tier
 * @returns The banner when a tier upgrade just occurred, otherwise null
 */
export function TierUnlockBanner({ holdTier }: { holdTier: HoldTier }) {
  const previousTierRef = useRef<HoldTier>(holdTier);
  const [banner, setBanner] = useState<TierUnlockSummary | null>(null);

  useEffect(() => {
    const previous = previousTierRef.current;
    previousTierRef.current = holdTier;
    if (previous === holdTier) return;
    if (!didHoldTierAdvance(previous, holdTier)) {
      setBanner(null);
      return;
    }
    const next = tierUnlockSummary(holdTier);
    if (next !== null) setBanner(next);
  }, [holdTier]);

  useEffect(() => {
    if (banner === null) return;
    const timer = setTimeout(() => {
      setBanner(null);
    }, TIER_UNLOCK_BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  if (banner === null) return null;

  return (
    <div className={styles.overlay} data-testid="tier-unlock-banner-overlay">
      <section
        aria-live="polite"
        className={styles.banner}
        data-testid="tier-unlock-banner"
        data-tier={banner.tier}
        role="status"
      >
        <div aria-hidden="true" className={styles.emblem}>
          <Sparkles size={20} strokeWidth={1.9} />
        </div>
        <div className={styles.body}>
          <span className={styles.kicker}>Hold Tier Reached</span>
          <h3 className={styles.headline}>{banner.headline}</h3>
          <p className={styles.summary}>{banner.summary}</p>
          <div className={styles.unlockGroups}>
            {banner.units.length === 0 ? null : (
              <div className={styles.unlockGroup}>
                <span className={styles.groupLabel}>Units</span>
                <ul className={styles.chipList}>
                  {banner.units.map((unit) => (
                    <li className={styles.chip} key={unit}>
                      {unit}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {banner.buildings.length === 0 ? null : (
              <div className={styles.unlockGroup}>
                <span className={styles.groupLabel}>Buildings</span>
                <ul className={styles.chipList}>
                  {banner.buildings.map((building) => (
                    <li className={styles.chip} key={building}>
                      {building}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <button
          aria-label="Dismiss tier unlock announcement"
          className={styles.dismiss}
          onClick={() => setBanner(null)}
          title="Dismiss"
          type="button"
        >
          <X aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </section>
    </div>
  );
}
