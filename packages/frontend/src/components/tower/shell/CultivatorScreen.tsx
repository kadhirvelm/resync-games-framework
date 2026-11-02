import {
  type CultivatorFields,
  MAX_CULTIVATORS_PER_PLAYER,
} from "@resync-game-framework/api";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { useState } from "react";
import { playSound } from "../audio/sound";
import { cultivatorArtLine, isCultivatorPainting } from "../logic/cultivators";
import { type SaveSlots, sortedClimbs } from "../logic/saveGame";
import { CULTIVATOR_GLYPH } from "../ownerColors";
import { Button } from "../parts/Button";
import { UnitPortrait } from "../parts/UnitPortrait";
import type { PlayerData } from "../usePlayer";
import { CultivatorDetail } from "./CultivatorDetail";
import { CultivatorForm, type CultivatorFormAction } from "./CultivatorForm";
import { ScreenHeader } from "./ScreenHeader";
import styles from "./shell.module.scss";

/** Opens the creation form instead of a cultivator. */
export const NEW_CULTIVATOR = "new";

/** Submit buttons on the creation form. */
const CREATE_ACTIONS: CultivatorFormAction[] = [
  { id: "paint", label: "Create and paint", needsAppearance: true },
  { id: "plain", label: "Create without art" },
];

/** Empty creation form. */
const BLANK_FIELDS: CultivatorFields = { appearance: "", name: "", title: "" };

interface CultivatorScreenProps {
  climbs: SaveSlots;
  /** Cultivator to open first, or {@link NEW_CULTIVATOR} */
  initialSelection?: string;
  onBack: () => void;
  /** Leaves for tower select with this cultivator chosen */
  onClimb: (cultivatorId: string) => void;
  player: PlayerData;
  reducedMotion: boolean;
}

/**
 * The player's roster of cultivators and the place to create one. Creating
 * names the cultivator and, with an appearance, starts painting their four
 * realm portraits and battle sprite in the background.
 * @param props - Saved climbs, player data, and navigation
 * @returns The cultivator screen
 */
export const CultivatorScreen = ({
  climbs,
  initialSelection,
  onBack,
  onClimb,
  player,
  reducedMotion,
}: CultivatorScreenProps) => {
  const { cultivators } = player;
  const [selection, setSelection] = useState(
    initialSelection ?? cultivators[0]?.id ?? NEW_CULTIVATOR,
  );
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [firstPaintError, setFirstPaintError] = useState<{
    cultivatorId: string;
    error: string;
  }>();
  const selected = cultivators.find((entry) => entry.id === selection);
  const creating = !selected;
  const rosterFull = cultivators.length >= MAX_CULTIVATORS_PER_PLAYER;
  const climbCounts = new Map<string, number>();
  for (const climb of sortedClimbs(climbs)) {
    climbCounts.set(
      climb.cultivatorId,
      (climbCounts.get(climb.cultivatorId) ?? 0) + 1,
    );
  }

  /**
   * Creates a cultivator, then paints them when asked.
   * @param fields - Name, title, and appearance
   * @param actionId - `paint` or `plain`
   */
  const create = async (fields: CultivatorFields, actionId: string) => {
    setBusy(true);
    setCreateError(undefined);
    try {
      const created = await player.createCultivator(fields);
      if (!created.ok) {
        setCreateError(created.error);
        return;
      }
      playSound("confirm");
      setSelection(created.cultivator.id);
      if (actionId !== "paint") {
        return;
      }
      // A paint failure, such as ProductNow not being connected, shows on
      // the new cultivator's own panel, where they can try again.
      const painted = await player.paintCultivator(created.cultivator.id);
      if (!painted.ok) {
        setFirstPaintError({
          cultivatorId: created.cultivator.id,
          error: painted.error,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * @param cultivatorId - Cultivator to release
   * @returns Why it failed, or `undefined`
   */
  const release = async (cultivatorId: string) => {
    const error = await player.deleteCultivator(cultivatorId);
    if (!error) {
      playSound("back");
      setSelection(
        cultivators.find((entry) => entry.id !== cultivatorId)?.id ??
          NEW_CULTIVATOR,
      );
    }
    return error;
  };

  return (
    <main className={styles.metaScreen}>
      <ScreenHeader eyebrow="Who climbs" onBack={onBack} title="Cultivators" />
      <p className={styles.metaIntro}>
        Every climb is made by one of your cultivators. Name them, describe
        them, and the workshop paints their four realms and the figure they
        fight as.
      </p>
      {player.status === "error" ? (
        <div className={styles.overwrite} role="alert">
          <p>Your cultivators could not be read: {player.loadError}</p>
          <div>
            <Button onClick={player.reload}>Try again</Button>
          </div>
        </div>
      ) : null}
      <div className={styles.towerSelect}>
        <ul aria-label="Your cultivators" className={styles.towerCards}>
          {cultivators.map((cultivator, index) => {
            const climbCount = climbCounts.get(cultivator.id) ?? 0;
            return (
              <li
                key={cultivator.id}
                style={{ "--i": index } as React.CSSProperties}
              >
                <button
                  aria-pressed={cultivator.id === selection}
                  className={clsx(
                    styles.cultivatorCard,
                    cultivator.id === selection && styles.towerCardSelected,
                  )}
                  onClick={() => {
                    playSound("select");
                    setSelection(cultivator.id);
                  }}
                  onMouseEnter={() => playSound("hover")}
                  type="button"
                >
                  <UnitPortrait
                    accent="#4e8f6a"
                    className={clsx(
                      isCultivatorPainting(cultivator) &&
                        styles.portraitPainting,
                    )}
                    glyph={CULTIVATOR_GLYPH}
                    name={cultivator.name}
                    size="small"
                    url={cultivator.portrait.asset?.levels[0]?.url}
                  />
                  <span className={styles.towerCardBody}>
                    <span className={styles.towerCardSource}>
                      {cultivator.title}
                    </span>
                    <strong>{cultivator.name}</strong>
                    <span className={styles.towerCardRecord}>
                      {cultivatorArtLine(cultivator)}
                      {climbCount > 0 ? ` · ${climbCount} saved` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {player.status === "loading" ? (
            <li className={styles.towerLoading}>Calling your cultivators…</li>
          ) : null}
          <li style={{ "--i": cultivators.length } as React.CSSProperties}>
            <button
              aria-pressed={creating}
              className={clsx(
                styles.cultivatorCard,
                styles.cultivatorCardNew,
                creating && styles.towerCardSelected,
              )}
              disabled={rosterFull}
              onClick={() => {
                playSound("select");
                setSelection(NEW_CULTIVATOR);
              }}
              type="button"
            >
              <Plus size={20} />
              <span>
                {rosterFull
                  ? `Roster full (${MAX_CULTIVATORS_PER_PLAYER})`
                  : "New cultivator"}
              </span>
            </button>
          </li>
        </ul>

        {selected ? (
          <CultivatorDetail
            climbCount={climbCounts.get(selected.id) ?? 0}
            cultivator={selected}
            initialPaintError={
              firstPaintError?.cultivatorId === selected.id
                ? firstPaintError.error
                : undefined
            }
            key={selected.id}
            onClimb={() => {
              playSound("climb");
              onClimb(selected.id);
            }}
            onPaint={(parts) => player.paintCultivator(selected.id, parts)}
            onRelease={() => release(selected.id)}
            onStop={() => player.stopPainting(selected.id)}
            onUpdate={(changes) =>
              player.updateCultivator(selected.id, changes)
            }
            reducedMotion={reducedMotion}
          />
        ) : (
          <section
            aria-label="New cultivator"
            className={styles.cultivatorDetail}
          >
            <header className={styles.cultivatorHero}>
              <div className={styles.cultivatorStage}>
                <UnitPortrait
                  accent="#4e8f6a"
                  glyph={CULTIVATOR_GLYPH}
                  name="New cultivator"
                  size="large"
                />
              </div>
              <div className={styles.cultivatorHeroText}>
                <p className={styles.detailEyebrow}>A new cultivator</p>
                <h2>
                  {cultivators.length === 0
                    ? "Who climbs the tower?"
                    : "Another walks the path"}
                </h2>
                <p className={styles.cultivatorAppearance}>
                  Painting takes a few minutes and reads the Lore in ProductNow.
                  You can climb before it finishes; your cultivator fights as a
                  stand-in until the art arrives.
                </p>
              </div>
            </header>
            <div className={styles.detailRow}>
              <CultivatorForm
                actions={CREATE_ACTIONS}
                busy={busy || player.status !== "ready" || rosterFull}
                error={createError}
                initial={BLANK_FIELDS}
                onSubmit={create}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
};
