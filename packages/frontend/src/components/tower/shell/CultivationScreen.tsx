import clsx from "clsx";
import { Gem } from "lucide-react";
import { useState } from "react";
import { playSound } from "../audio/sound";
import {
  nextUpgradeCost,
  type PlayerProfile,
  UPGRADES,
  type UpgradeId,
  upgradeRank,
} from "../logic/progression";
import { Burst } from "../parts/Burst";
import { LeafIcon } from "../parts/LeafIcon";
import { ScreenHeader } from "./ScreenHeader";
import styles from "./shell.module.scss";

interface CultivationScreenProps {
  onBack: () => void;
  onPurchase: (id: UpgradeId) => void;
  profile: PlayerProfile;
}

/**
 * Permanent upgrades bought with Jade Essence. Each card shows its ranks as
 * leaves and what the next rank costs. A purchase bursts with light, rings
 * a coin, and pops its new rank leaf in.
 * @param onBack - Returns to the main menu
 * @param onPurchase - Buys the next rank of an upgrade
 * @param profile - Player profile
 * @returns The cultivation screen
 */
export const CultivationScreen = ({
  onBack,
  onPurchase,
  profile,
}: CultivationScreenProps) => {
  const [justBought, setJustBought] = useState<{
    id: UpgradeId;
    stamp: number;
  }>();

  return (
    <main className={styles.metaScreen}>
      <ScreenHeader
        essence={profile.essence}
        eyebrow="Between climbs"
        onBack={onBack}
        title="Cultivation"
      />
      <p className={styles.metaIntro}>
        Every climb leaves Jade Essence behind: more for higher floors, a
        summit, and harder ascensions. What you cultivate here stays with you.
      </p>
      <div className={styles.upgradeGrid}>
        {UPGRADES.map((upgrade, index) => {
          const rank = upgradeRank(profile, upgrade.id);
          const cost = nextUpgradeCost(profile, upgrade.id);
          const affordable = cost !== undefined && profile.essence >= cost;
          const bought = justBought?.id === upgrade.id;
          return (
            <article
              className={clsx(
                styles.upgradeCard,
                cost === undefined && styles.upgradeMastered,
                affordable && styles.upgradeAffordable,
                bought && styles.upgradeGlow,
              )}
              key={bought ? `${upgrade.id}-${justBought.stamp}` : upgrade.id}
              style={{ "--i": index } as React.CSSProperties}
            >
              {bought ? <Burst count={20} reach={170} /> : null}
              <header>
                <h2>{upgrade.name}</h2>
                <span
                  aria-label={`Rank ${rank} of ${upgrade.costs.length}`}
                  className={styles.rankLeaves}
                  role="img"
                >
                  {upgrade.costs.map((_, step) => (
                    <LeafIcon
                      className={clsx(
                        bought && step === rank - 1 && styles.rankLeafNew,
                      )}
                      filled={step < rank}
                      // biome-ignore lint/suspicious/noArrayIndexKey: ranks are positional
                      key={step}
                      size={16}
                    />
                  ))}
                </span>
              </header>
              <p className={styles.upgradeLore}>{upgrade.lore}</p>
              <p className={styles.upgradeEffect}>
                {upgrade.effect}
                {upgrade.costs.length > 1 ? " per rank" : ""}
              </p>
              {cost === undefined ? (
                <p className={styles.masteredLine}>Mastered</p>
              ) : (
                <button
                  className={styles.upgradeBuy}
                  disabled={!affordable}
                  onClick={() => {
                    playSound("purchase");
                    playSound("coin");
                    setJustBought({ id: upgrade.id, stamp: Date.now() });
                    onPurchase(upgrade.id);
                  }}
                  onMouseEnter={() => playSound("hover")}
                  type="button"
                >
                  <span>{rank === 0 ? "Cultivate" : "Deepen"}</span>
                  <span className={styles.upgradeCost}>
                    <Gem size={14} /> {cost}
                  </span>
                </button>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
};
