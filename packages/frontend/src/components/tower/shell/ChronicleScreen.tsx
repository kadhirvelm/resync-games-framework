import clsx from "clsx";
import { Crown, Leaf } from "lucide-react";
import { useState } from "react";
import { playSound } from "../audio/sound";
import type { PlayerProfile } from "../logic/progression";
import { ROLE_LABELS } from "../parts/CorebornOffer";
import { TierLeaves } from "../parts/TierLeaves";
import { UnitPortrait } from "../parts/UnitPortrait";
import { ascensionNumeral, formatTimeAgo } from "./formatTime";
import { ScreenHeader } from "./ScreenHeader";
import styles from "./shell.module.scss";

type ChronicleTab = "records" | "coreborn" | "bestiary";

const TAB_LABELS: Record<ChronicleTab, string> = {
  bestiary: "Bestiary",
  coreborn: "Coreborn",
  records: "Records",
};

/**
 * Lifetime records, recent climbs, every Coreborn recruited, and every
 * enemy quieted, across all towers.
 * @param onBack - Returns to the main menu
 * @param profile - Player profile
 * @returns The chronicle screen
 */
export const ChronicleScreen = ({
  onBack,
  profile,
}: {
  onBack: () => void;
  profile: PlayerProfile;
}) => {
  const [tab, setTab] = useState<ChronicleTab>("records");
  const coreborn = Object.entries(profile.codex.coreborn).sort(
    ([, left], [, right]) =>
      right.bestTier - left.bestTier || left.name.localeCompare(right.name),
  );
  const enemies = Object.entries(profile.codex.enemies).sort(
    ([, left], [, right]) => left.name.localeCompare(right.name),
  );
  const towers = Object.entries(profile.towers);
  const now = Date.now();

  return (
    <main className={styles.metaScreen}>
      <ScreenHeader eyebrow="Your story" onBack={onBack} title="Chronicle" />
      <div className={styles.tabs} role="tablist">
        {(Object.keys(TAB_LABELS) as ChronicleTab[]).map((key) => (
          <button
            aria-selected={tab === key}
            className={clsx(styles.tab, tab === key && styles.tabActive)}
            key={key}
            onClick={() => {
              playSound("select");
              setTab(key);
            }}
            role="tab"
            type="button"
          >
            {TAB_LABELS[key]}
            {key === "coreborn" ? <span>{coreborn.length}</span> : null}
            {key === "bestiary" ? <span>{enemies.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === "records" ? (
        <div className={styles.tabPanel} key="records" role="tabpanel">
          <dl className={styles.statTiles}>
            {[
              ["Climbs", profile.totals.climbs],
              ["Summits", profile.totals.victories],
              ["Floors cleared", profile.totals.floorsCleared],
              ["Coreborn recruited", profile.totals.recruited],
              ["Merges", profile.totals.merges],
              ["Essence earned", profile.lifetimeEssence],
            ].map(([label, value], index) => (
              <div key={label} style={{ "--i": index } as React.CSSProperties}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <h2 className={styles.sectionHeading}>Towers</h2>
          {towers.length === 0 ? (
            <p className={styles.emptyLine}>
              No tower climbed yet. The first floor is waiting.
            </p>
          ) : (
            <ul className={styles.recordList}>
              {towers.map(([id, record]) => (
                <li key={id}>
                  <strong>{record.title}</strong>
                  <span>Best floor {record.bestFloor}</span>
                  <span>
                    {record.victories} of {record.climbs} climbs reached the
                    summit
                  </span>
                  <span>
                    {record.highestAscensionCleared >= 0
                      ? `Ascension ${ascensionNumeral(record.highestAscensionCleared)} cleared`
                      : "Not yet cleared"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2 className={styles.sectionHeading}>Recent climbs</h2>
          {profile.history.length === 0 ? (
            <p className={styles.emptyLine}>
              Your climbs will be written here.
            </p>
          ) : (
            <ol className={styles.historyList}>
              {profile.history.map((entry) => (
                <li
                  className={
                    entry.outcome === "victory"
                      ? styles.historyVictory
                      : undefined
                  }
                  key={entry.endedAt}
                >
                  {entry.outcome === "victory" ? (
                    <Crown size={16} />
                  ) : (
                    <Leaf size={16} />
                  )}
                  <strong>{entry.towerTitle}</strong>
                  <span>
                    {entry.outcome === "victory"
                      ? "Summit reached"
                      : `Fell on floor ${entry.floor} of ${entry.floorCount}`}
                    {entry.ascension > 0
                      ? ` · Ascension ${ascensionNumeral(entry.ascension)}`
                      : ""}
                  </span>
                  <span>+{entry.essence} essence</span>
                  <time>{formatTimeAgo(entry.endedAt, now)}</time>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {tab === "coreborn" ? (
        <div className={styles.tabPanel} key="coreborn" role="tabpanel">
          {coreborn.length === 0 ? (
            <p className={styles.emptyLine}>
              Recruit a Coreborn on a climb and it will be remembered here.
            </p>
          ) : (
            <ul className={styles.codexGrid}>
              {coreborn.map(([key, entry], index) => (
                <li
                  key={key}
                  style={{ "--i": index % 12 } as React.CSSProperties}
                >
                  <UnitPortrait
                    accent="#4e8f6a"
                    name={entry.name}
                    size="medium"
                    url={entry.portraitUrl}
                  />
                  <strong>{entry.name}</strong>
                  <span className={styles.codexMeta}>
                    {ROLE_LABELS[entry.role]} · {entry.towerTitle}
                  </span>
                  <TierLeaves tier={entry.bestTier} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "bestiary" ? (
        <div className={styles.tabPanel} key="bestiary" role="tabpanel">
          {enemies.length === 0 ? (
            <p className={styles.emptyLine}>
              Creatures you defeat will be recorded here.
            </p>
          ) : (
            <ul className={styles.codexGrid}>
              {enemies.map(([key, entry], index) => (
                <li
                  key={key}
                  style={{ "--i": index % 12 } as React.CSSProperties}
                >
                  <UnitPortrait
                    accent={entry.bossDefeated ? "#c49a3a" : "#b5543f"}
                    name={entry.name}
                    size="medium"
                    url={entry.imageUrl}
                  />
                  <strong>{entry.name}</strong>
                  <span className={styles.codexMeta}>{entry.towerTitle}</span>
                  {entry.bossDefeated ? (
                    <span className={styles.bossBadge}>
                      <Crown size={12} /> Tower Heart quieted
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </main>
  );
};
