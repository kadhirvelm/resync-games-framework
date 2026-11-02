import type { CultivatorRecord } from "@resync-game-framework/api";
import clsx from "clsx";
import { Crown, Lock, Mountain, Play, Plus, X } from "lucide-react";
import { useState } from "react";
import { playSound } from "../audio/sound";
import type { TowerChoice } from "../logic/buildTowerContent";
import { cultivatorPortraitUrl } from "../logic/cultivatorRealm";
import { UNKNOWN_CULTIVATOR_NAME } from "../logic/cultivators";
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
import {
  climbsForTower,
  type SavedClimb,
  type SaveSlots,
} from "../logic/saveGame";
import type { TowerContent } from "../logic/towerTypes";
import { CULTIVATOR_GLYPH } from "../ownerColors";
import { Button } from "../parts/Button";
import { UnitPortrait } from "../parts/UnitPortrait";
import { useTilt } from "../parts/useTilt";
import { NEW_CULTIVATOR } from "./CultivatorScreen";
import { ascensionNumeral, formatTimeAgo } from "./formatTime";
import { ScreenHeader } from "./ScreenHeader";
import styles from "./shell.module.scss";

/** A tower choice with its content already built. */
export interface TowerEntry {
  choice: TowerChoice;
  content: TowerContent;
}

interface TowerSelectScreenProps {
  /** Saved climbs across every tower */
  climbs: SaveSlots;
  cultivators: CultivatorRecord[];
  entries: TowerEntry[];
  isLoading: boolean;
  /** Ends a saved climb without settling it */
  onAbandon: (climbId: string) => void;
  onBack: () => void;
  /** Opens the cultivator screen on a cultivator, or the creation form */
  onManageCultivators: (selection: string) => void;
  onResume: (saved: SavedClimb) => void;
  onSelectCultivator: (cultivatorId: string) => void;
  /** Begins a new climb as the selected cultivator */
  onStart: (content: TowerContent, ascension: number) => void;
  profile: PlayerProfile;
  selectedCultivatorId?: string;
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
 * Picks a tower, shows its records and roster, and starts a new climb as a
 * chosen cultivator at a chosen ascension, or resumes or abandons one of the
 * tower's saved climbs. Beating a tower unlocks its next ascension.
 * @param props - Towers, cultivators, profile, saves, and the climb actions
 * @returns The tower select screen
 */
export const TowerSelectScreen = ({
  climbs,
  cultivators,
  entries,
  isLoading,
  onAbandon,
  onBack,
  onManageCultivators,
  onResume,
  onSelectCultivator,
  onStart,
  profile,
  selectedCultivatorId,
  warnings,
}: TowerSelectScreenProps) => {
  const tilt = useTilt(6);
  const savedFirst =
    entries.find(
      (entry) => climbsForTower(climbs, entry.content.id).length > 0,
    ) ?? entries[0];
  const [selectedId, setSelectedId] = useState(savedFirst?.content.id);
  const selected =
    entries.find((entry) => entry.content.id === selectedId) ?? entries[0];
  const unlocked = selected
    ? unlockedAscension(profile, selected.content.id)
    : 0;
  const [ascension, setAscension] = useState(unlocked);
  const [confirmingAbandon, setConfirmingAbandon] = useState<string>();
  const level = Math.min(ascension, unlocked);
  const towerClimbs = selected
    ? climbsForTower(climbs, selected.content.id)
    : [];
  const climber =
    cultivators.find((entry) => entry.id === selectedCultivatorId) ??
    cultivators[0];
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
    setConfirmingAbandon(undefined);
  };

  const begin = () => {
    if (!selected) {
      return;
    }
    if (!climber) {
      playSound("select");
      onManageCultivators(NEW_CULTIVATOR);
      return;
    }
    playSound("climb");
    onStart(selected.content, level);
  };

  /**
   * @param cultivatorId - Cultivator of a saved climb
   * @returns Their name, or a stand-in when they were released
   */
  const climberName = (cultivatorId: string) =>
    cultivators.find((entry) => entry.id === cultivatorId)?.name ??
    UNKNOWN_CULTIVATOR_NAME;

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
            const savedCount = climbsForTower(climbs, entry.content.id).length;
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
                    {savedCount > 0 ? (
                      <span className={styles.savedPill}>
                        {savedCount === 1
                          ? "Climb saved"
                          : `${savedCount} climbs saved`}
                      </span>
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
              <h3>Climbing as</h3>
              {cultivators.length === 0 ? (
                <p className={styles.mutedSmall}>
                  Every climb is made by one of your cultivators. Create one to
                  begin.
                </p>
              ) : null}
              <div className={styles.climberRow}>
                {cultivators.map((cultivator) => (
                  <button
                    aria-pressed={cultivator.id === climber?.id}
                    className={clsx(
                      styles.climberChip,
                      cultivator.id === climber?.id && styles.climberChipActive,
                    )}
                    key={cultivator.id}
                    onClick={() => {
                      playSound("select");
                      onSelectCultivator(cultivator.id);
                    }}
                    onMouseEnter={() => playSound("hover")}
                    type="button"
                  >
                    <UnitPortrait
                      accent="#4e8f6a"
                      glyph={CULTIVATOR_GLYPH}
                      name={cultivator.name}
                      size="small"
                      url={cultivator.portrait.asset?.levels[0]?.url}
                    />
                    <span>
                      <strong>{cultivator.name}</strong>
                      <small>{cultivator.title}</small>
                    </span>
                  </button>
                ))}
                <button
                  className={clsx(styles.climberChip, styles.climberChipNew)}
                  onClick={() => {
                    playSound("select");
                    onManageCultivators(NEW_CULTIVATOR);
                  }}
                  type="button"
                >
                  <Plus size={16} /> New
                </button>
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

            {towerClimbs.length > 0 ? (
              <div className={styles.detailRow}>
                <h3>Saved climbs</h3>
                <ul className={styles.savedClimbList}>
                  {towerClimbs.map((climb) => (
                    <li key={climb.id}>
                      <UnitPortrait
                        accent="#4e8f6a"
                        glyph={CULTIVATOR_GLYPH}
                        name={climberName(climb.cultivatorId)}
                        size="small"
                        url={cultivatorPortraitUrl(
                          climb.content.cultivator,
                          climb.run,
                        )}
                      />
                      <span className={styles.savedClimbText}>
                        <strong>{climberName(climb.cultivatorId)}</strong>
                        <small>
                          Floor {climb.run.floorIndex + 1} of{" "}
                          {climb.run.rooms.length}
                          {climb.run.ascension > 0
                            ? ` · Ascension ${ascensionNumeral(climb.run.ascension)}`
                            : ""}{" "}
                          · {formatTimeAgo(climb.savedAt, Date.now())}
                        </small>
                      </span>
                      {confirmingAbandon === climb.id ? (
                        <span className={styles.savedClimbConfirm}>
                          Ends it and earns nothing.
                          <Button
                            onClick={() => {
                              playSound("back");
                              setConfirmingAbandon(undefined);
                              onAbandon(climb.id);
                            }}
                            variant="quiet"
                          >
                            Abandon
                          </Button>
                          <Button
                            onClick={() => setConfirmingAbandon(undefined)}
                            variant="quiet"
                          >
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <span className={styles.savedClimbActions}>
                          <Button
                            onClick={() => {
                              playSound("climb");
                              onResume(climb);
                            }}
                          >
                            <Play size={16} /> Resume
                          </Button>
                          <button
                            aria-label={`Abandon ${climberName(climb.cultivatorId)}'s climb`}
                            className={styles.iconButton}
                            onClick={() => {
                              playSound("select");
                              setConfirmingAbandon(climb.id);
                            }}
                            title="Abandon"
                            type="button"
                          >
                            <X size={16} />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={styles.detailActions}>
              <Button
                className={styles.detailPrimary}
                disabled={isLoading && entries.length === 0}
                onClick={begin}
                variant={towerClimbs.length > 0 ? "quiet" : "primary"}
              >
                {climber
                  ? `Begin a new climb as ${climber.name}${level > 0 ? ` · Ascension ${ascensionNumeral(level)}` : ""}`
                  : "Create your cultivator"}
              </Button>
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
