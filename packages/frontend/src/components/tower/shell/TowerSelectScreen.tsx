import clsx from "clsx";
import { Crown, Lock, Mountain, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { playSound } from "../audio/sound";
import type { TowerChoice } from "../logic/buildTowerContent";
import {
  ASCENSION_ATTACK_STEP,
  ASCENSION_HEALTH_STEP,
  MAX_ASCENSION,
} from "../logic/generateTower";
import {
  ASCENSION_NAMES,
  ESSENCE_ASCENSION_BONUS,
  type PlayerProfile,
  UPGRADES,
  unlockedAscension,
  upgradeRank,
} from "../logic/progression";
import type { SavedClimb, SaveSlots } from "../logic/saveGame";
import type { TowerContent } from "../logic/towerTypes";
import { Button } from "../parts/Button";
import { UnitPortrait } from "../parts/UnitPortrait";
import { useTilt } from "../parts/useTilt";
import { ascensionNumeral, formatTimeAgo } from "./formatTime";
import { ScreenHeader } from "./ScreenHeader";
import styles from "./shell.module.scss";

/** A tower choice with its content already built. */
export interface TowerEntry {
  choice: TowerChoice;
  content: TowerContent;
}

interface TowerSelectScreenProps {
  entries: TowerEntry[];
  isLoading: boolean;
  onBack: () => void;
  onResume: (saved: SavedClimb) => void;
  onStart: (content: TowerContent, ascension: number) => void;
  profile: PlayerProfile;
  saves: SaveSlots;
  warnings: string[];
}

const SOURCE_LABELS: Record<TowerChoice["source"], string> = {
  "built-in": "Built-in tower",
  dungeon: "Generated dungeon",
  gallery: "Workshop gallery",
};

/**
 * @param content - Tower content
 * @returns The first room backdrop, for the tower's art
 */
function towerArt(content: TowerContent): string | undefined {
  return content.scenes.find((scene) => scene.imageUrl)?.imageUrl;
}

/**
 * @param level - Ascension level
 * @returns What that level changes, in one line
 */
function ascensionEffect(level: number): string {
  if (level === 0) {
    return "The tower as it was made. A good place to learn its rooms.";
  }
  const health = Math.round(level * ASCENSION_HEALTH_STEP * 100);
  const attack = Math.round(level * ASCENSION_ATTACK_STEP * 100);
  const essence = Math.round(level * ESSENCE_ASCENSION_BONUS * 100);
  return `Enemies +${health}% health and +${attack}% attack · +${essence}% essence`;
}

/**
 * Picks a tower, shows its records and roster, and starts or resumes a
 * climb at a chosen ascension. Beating a tower unlocks its next ascension.
 * @param props - Towers, profile, saves, and the start actions
 * @returns The tower select screen
 */
export const TowerSelectScreen = ({
  entries,
  isLoading,
  onBack,
  onResume,
  onStart,
  profile,
  saves,
  warnings,
}: TowerSelectScreenProps) => {
  const tilt = useTilt(6);
  const savedFirst =
    entries.find((entry) => saves[entry.content.id]) ?? entries[0];
  const [selectedId, setSelectedId] = useState(savedFirst?.content.id);
  const selected =
    entries.find((entry) => entry.content.id === selectedId) ?? entries[0];
  const unlocked = selected
    ? unlockedAscension(profile, selected.content.id)
    : 0;
  const [ascension, setAscension] = useState(unlocked);
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const level = Math.min(ascension, unlocked);
  const saved = selected ? saves[selected.content.id] : undefined;
  const bonuses = UPGRADES.filter(
    (upgrade) => upgradeRank(profile, upgrade.id) > 0,
  );

  /**
   * @param entry - Tower to show in the detail panel
   */
  const select = (entry: TowerEntry) => {
    playSound("select");
    setSelectedId(entry.content.id);
    setAscension(unlockedAscension(profile, entry.content.id));
    setConfirmingOverwrite(false);
  };

  const begin = () => {
    if (!selected) {
      return;
    }
    if (saved && !confirmingOverwrite) {
      playSound("select");
      setConfirmingOverwrite(true);
      return;
    }
    playSound("climb");
    onStart(selected.content, level);
  };

  return (
    <main className={styles.metaScreen}>
      <ScreenHeader
        essence={profile.essence}
        eyebrow="New climb"
        onBack={onBack}
        title="Choose a tower"
      />
      <div className={styles.towerSelect}>
        <ul aria-label="Towers" className={styles.towerCards}>
          {entries.map((entry, index) => {
            const record = profile.towers[entry.content.id];
            const art = towerArt(entry.content);
            const isSaved = Boolean(saves[entry.content.id]);
            return (
              <li
                key={entry.content.id}
                style={{ "--i": index } as React.CSSProperties}
              >
                <button
                  aria-pressed={entry.content.id === selected?.content.id}
                  className={clsx(
                    styles.towerCard,
                    entry.content.id === selected?.content.id &&
                      styles.towerCardSelected,
                  )}
                  onClick={() => select(entry)}
                  onMouseEnter={() => playSound("hover")}
                  type="button"
                  {...tilt}
                >
                  <span
                    className={styles.towerCardArt}
                    style={
                      art
                        ? ({
                            "--art": `url("${art}")`,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {isSaved ? (
                      <span className={styles.savedPill}>Climb saved</span>
                    ) : null}
                  </span>
                  <span className={styles.towerCardBody}>
                    <span className={styles.towerCardSource}>
                      {SOURCE_LABELS[entry.choice.source]}
                      {entry.choice.source === "dungeon"
                        ? ` · ${entry.choice.readySlots}/${entry.choice.totalSlots} assets`
                        : null}
                    </span>
                    <strong>{entry.content.title}</strong>
                    <span className={styles.towerCardRecord}>
                      {record ? (
                        <>
                          <Mountain size={13} /> Best floor {record.bestFloor}
                          {record.victories > 0 ? (
                            <>
                              {" "}
                              · <Crown size={13} /> {record.victories}
                            </>
                          ) : null}
                        </>
                      ) : (
                        "Unclimbed"
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {isLoading ? (
            <li className={styles.towerLoading}>Reading the workshop…</li>
          ) : null}
        </ul>

        {selected ? (
          <section
            aria-label={selected.content.title}
            className={styles.towerDetail}
            key={selected.content.id}
          >
            <div
              className={styles.towerDetailArt}
              style={
                towerArt(selected.content)
                  ? ({
                      "--art": `url("${towerArt(selected.content)}")`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <div>
                <p className={styles.detailEyebrow}>
                  {SOURCE_LABELS[selected.choice.source]}
                </p>
                <h2>{selected.content.title}</h2>
              </div>
            </div>
            <p className={styles.detailSummary}>{selected.content.summary}</p>

            <div className={styles.detailRow}>
              <h3>Coreborn who may answer</h3>
              <div className={styles.rosterRow}>
                {selected.content.coreborn
                  .slice(0, 8)
                  .map((template, index) => (
                    <span
                      className={styles.rosterMember}
                      key={template.id}
                      style={{ "--i": index } as React.CSSProperties}
                    >
                      <UnitPortrait
                        accent="#4e8f6a"
                        name={template.name}
                        size="small"
                        url={template.tiers[0]?.portraitUrl}
                      />
                    </span>
                  ))}
              </div>
            </div>

            <div className={styles.detailRow}>
              <h3>Ascension</h3>
              <div className={styles.ascensionPicker}>
                {ASCENSION_NAMES.map((name, value) => {
                  const locked = value > unlocked;
                  return (
                    <button
                      aria-label={`Ascension ${value}${locked ? ", locked" : ""}`}
                      aria-pressed={value === level}
                      className={clsx(
                        styles.ascensionPip,
                        value === level && styles.ascensionPipActive,
                      )}
                      disabled={locked}
                      key={name}
                      onClick={() => {
                        playSound("select", { pitch: 1 + value * 0.09 });
                        setAscension(value);
                      }}
                      title={name}
                      type="button"
                    >
                      {locked ? <Lock size={13} /> : ascensionNumeral(value)}
                    </button>
                  );
                })}
              </div>
              <p className={styles.ascensionText} key={level}>
                <strong>{ASCENSION_NAMES[level]}</strong> ·{" "}
                {ascensionEffect(level)}
              </p>
              {unlocked < MAX_ASCENSION ? (
                <p className={styles.mutedSmall}>
                  Reach the summit at Ascension {ascensionNumeral(unlocked)} to
                  unlock the next.
                </p>
              ) : null}
            </div>

            {bonuses.length > 0 ? (
              <div className={styles.detailRow}>
                <h3>Your cultivation</h3>
                <ul className={styles.bonusList}>
                  {bonuses.map((upgrade) => (
                    <li key={upgrade.id}>
                      {upgrade.name}{" "}
                      <span>
                        {upgradeRank(profile, upgrade.id)}/
                        {upgrade.costs.length}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={styles.detailActions}>
              {saved ? (
                <Button
                  className={styles.detailPrimary}
                  onClick={() => {
                    playSound("climb");
                    onResume(saved);
                  }}
                >
                  <Play size={18} /> Resume · floor {saved.run.floorIndex + 1}
                  <small>{formatTimeAgo(saved.savedAt, Date.now())}</small>
                </Button>
              ) : null}
              {confirmingOverwrite ? (
                <div className={styles.overwrite} role="alert">
                  <p>
                    Starting over ends the saved climb on floor{" "}
                    {(saved?.run.floorIndex ?? 0) + 1}. It earns nothing.
                  </p>
                  <div>
                    <Button onClick={begin}>Begin anyway</Button>
                    <Button
                      onClick={() => setConfirmingOverwrite(false)}
                      variant="quiet"
                    >
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className={saved ? undefined : styles.detailPrimary}
                  onClick={begin}
                  variant={saved ? "quiet" : "primary"}
                >
                  {saved ? <RotateCcw size={16} /> : null}
                  {saved
                    ? "Begin a new climb"
                    : `Begin the climb${level > 0 ? ` · Ascension ${ascensionNumeral(level)}` : ""}`}
                </Button>
              )}
            </div>
          </section>
        ) : null}
      </div>
      {warnings.length > 0 ? (
        <p className={styles.warningLine}>
          Some workshop lists could not be read, so missing pieces use built-in
          stand-ins. {warnings.join(" · ")}
        </p>
      ) : null}
    </main>
  );
};
