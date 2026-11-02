import type {
  CultivatorArtPart,
  CultivatorArtState,
  CultivatorFields,
  CultivatorRecord,
} from "@resync-game-framework/api";
import clsx from "clsx";
import { Brush, Mountain, Square } from "lucide-react";
import { useState } from "react";
import { ProductNowConnection } from "@/components/productNow/ProductNowConnection";
import { playSound } from "../audio/sound";
import { toUnitSprite } from "../logic/buildTowerContent";
import type { UnitSpriteMove } from "../logic/towerTypes";
import { CULTIVATOR_GLYPH } from "../ownerColors";
import { Button } from "../parts/Button";
import { SpritePreview } from "../parts/SpritePreview";
import { UnitPortrait } from "../parts/UnitPortrait";
import type { CultivatorResult } from "../usePlayer";
import { CultivatorForm } from "./CultivatorForm";
import styles from "./shell.module.scss";

/** Realm numerals under the four portraits. */
const REALM_NUMERALS = ["I", "II", "III", "IV"];

/** Strips the preview can play, in the order of its buttons. */
const PREVIEW_MOVES: { label: string; move: UnitSpriteMove }[] = [
  { label: "Idle", move: "idle" },
  { label: "Attack", move: "attack" },
  { label: "Defend", move: "defend" },
  { label: "Hurt", move: "hurt" },
];

interface CultivatorDetailProps {
  /** Saved climbs this cultivator has in progress */
  climbCount: number;
  cultivator: CultivatorRecord;
  /** Why painting failed right after the cultivator was created */
  initialPaintError?: string;
  onClimb: () => void;
  onPaint: (parts?: CultivatorArtPart[]) => Promise<CultivatorResult>;
  onRelease: () => Promise<string | undefined>;
  onStop: () => Promise<CultivatorResult>;
  onUpdate: (changes: Partial<CultivatorFields>) => Promise<CultivatorResult>;
  reducedMotion: boolean;
}

/**
 * @param part - Portrait or sprite state
 * @returns Its status in a few words
 */
function partStatus(part: CultivatorArtState<unknown>): string {
  if (part.status === "painting") {
    return part.asset ? "Repainting…" : "Painting…";
  }
  if (part.status === "failed") {
    return "Failed";
  }
  return part.asset ? "Ready" : "Not painted";
}

/**
 * One cultivator: their four realm portraits, their battle sprite, painting
 * controls, their details, and release.
 * @param props - Cultivator, climb count, and its actions
 * @returns The detail panel
 */
export const CultivatorDetail = ({
  climbCount,
  cultivator,
  initialPaintError,
  onClimb,
  onPaint,
  onRelease,
  onStop,
  onUpdate,
  reducedMotion,
}: CultivatorDetailProps) => {
  const [busy, setBusy] = useState(false);
  const [paintError, setPaintError] = useState(initialPaintError);
  const [formError, setFormError] = useState<string>();
  const [savedNote, setSavedNote] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [move, setMove] = useState<UnitSpriteMove>("idle");
  const { portrait, sprite } = cultivator;
  const realms = portrait.asset?.levels ?? [];
  const unitSprite = sprite.asset ? toUnitSprite(sprite.asset) : undefined;
  const painting =
    portrait.status === "painting" || sprite.status === "painting";
  const errors = [portrait.error, sprite.error].filter(Boolean);

  /**
   * @param request - Action to run with the buttons turned off
   * @returns The action's result
   */
  const run = async <T,>(request: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await request();
    } finally {
      setBusy(false);
    }
  };

  /**
   * @param parts - Parts to paint, or both
   */
  const paint = async (parts?: CultivatorArtPart[]) => {
    playSound("confirm");
    setPaintError(undefined);
    const result = await run(() => onPaint(parts));
    if (!result.ok) {
      setPaintError(result.error);
    }
  };

  /**
   * @param fields - Edited name, title, and appearance
   */
  const save = async (fields: CultivatorFields) => {
    setFormError(undefined);
    setSavedNote(false);
    const result = await run(() => onUpdate(fields));
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    playSound("select");
    setSavedNote(true);
  };

  const release = async () => {
    const error = await run(onRelease);
    if (error) {
      setFormError(error);
      setConfirmRelease(false);
    }
  };

  return (
    <section
      aria-label={cultivator.name}
      className={styles.cultivatorDetail}
      key={cultivator.id}
    >
      <header className={styles.cultivatorHero}>
        <div className={styles.cultivatorStage}>
          {unitSprite ? (
            <SpritePreview
              height={180}
              move={move}
              name={`${cultivator.name}, ${move}`}
              sprite={unitSprite}
              still={reducedMotion}
            />
          ) : (
            <UnitPortrait
              accent="#4e8f6a"
              glyph={CULTIVATOR_GLYPH}
              name={cultivator.name}
              size="large"
              url={realms[0]?.url}
            />
          )}
          {painting ? <span className={styles.paintingWash} /> : null}
        </div>
        <div className={styles.cultivatorHeroText}>
          <p className={styles.detailEyebrow}>{cultivator.title}</p>
          <h2>{cultivator.name}</h2>
          <p className={styles.cultivatorAppearance}>
            {cultivator.appearance || "No appearance written yet."}
          </p>
          {unitSprite ? (
            <div className={styles.moveRow}>
              {PREVIEW_MOVES.map((entry) => (
                <button
                  aria-pressed={move === entry.move}
                  className={clsx(
                    styles.ideaChip,
                    move === entry.move && styles.ideaChipActive,
                  )}
                  disabled={!unitSprite.animations[entry.move]}
                  key={entry.move}
                  onClick={() => {
                    playSound("select");
                    setMove(entry.move);
                  }}
                  type="button"
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : null}
          <Button className={styles.detailPrimary} onClick={onClimb}>
            <Mountain size={18} /> Climb as {cultivator.name}
            {climbCount > 0 ? (
              <small>
                {climbCount} {climbCount === 1 ? "climb" : "climbs"} saved
              </small>
            ) : null}
          </Button>
        </div>
      </header>

      <div className={styles.detailRow}>
        <h3>Cultivation realms</h3>
        <ol className={styles.realmRow}>
          {REALM_NUMERALS.map((numeral, index) => {
            const realm = realms[index];
            return (
              <li key={numeral} style={{ "--i": index } as React.CSSProperties}>
                <UnitPortrait
                  accent="#4e8f6a"
                  glyph={numeral}
                  muted={!realm}
                  name={realm?.title ?? `Realm ${numeral}`}
                  size="medium"
                  url={realm?.url}
                />
                <span>
                  <strong>{numeral}</strong> {realm?.title ?? "Unpainted"}
                </span>
              </li>
            );
          })}
        </ol>
        <p className={styles.mutedSmall}>
          On a climb, the portrait rises a realm with every quarter of the
          tower.
        </p>
      </div>

      <div className={styles.detailRow}>
        <h3>Painting</h3>
        <ul className={styles.paintParts}>
          <li data-status={portrait.status}>
            <span>Realm portraits</span>
            <em>{partStatus(portrait)}</em>
          </li>
          <li data-status={sprite.status}>
            <span>Battle sprite</span>
            <em>{partStatus(sprite)}</em>
          </li>
        </ul>
        {errors.length > 0 ? (
          <p className={styles.formError}>{errors.join(" · ")}</p>
        ) : null}
        {paintError ? (
          <div className={styles.paintHelp} role="alert">
            <p className={styles.formError}>{paintError}</p>
            <p className={styles.mutedSmall}>
              The painters read the Lore document in ProductNow first.
            </p>
            <ProductNowConnection placement="inline" />
          </div>
        ) : null}
        <div className={styles.formActions}>
          {painting ? (
            <Button disabled={busy} onClick={() => run(onStop)} variant="quiet">
              <Square size={14} /> Stop painting
            </Button>
          ) : (
            <>
              <Button
                disabled={busy || cultivator.appearance.trim() === ""}
                onClick={() => paint()}
              >
                <Brush size={16} />
                {portrait.asset || sprite.asset ? "Repaint both" : "Paint"}
              </Button>
              {portrait.asset ? (
                <Button
                  disabled={busy}
                  onClick={() => paint(["portrait"])}
                  variant="quiet"
                >
                  Portraits only
                </Button>
              ) : null}
              {sprite.asset ? (
                <Button
                  disabled={busy}
                  onClick={() => paint(["sprite"])}
                  variant="quiet"
                >
                  Sprite only
                </Button>
              ) : null}
            </>
          )}
        </div>
        {painting ? (
          <p className={styles.mutedSmall}>
            Painting takes a few minutes. You can leave this screen or climb
            meanwhile; the art appears when it is done.
          </p>
        ) : null}
      </div>

      <div className={styles.detailRow}>
        <h3>Details</h3>
        <CultivatorForm
          actions={[{ id: "save", label: "Save changes" }]}
          busy={busy}
          error={formError}
          initial={{
            appearance: cultivator.appearance,
            name: cultivator.name,
            title: cultivator.title,
          }}
          key={`${cultivator.name}|${cultivator.title}|${cultivator.appearance}`}
          onSubmit={(fields) => save(fields)}
        />
        {savedNote ? (
          <p className={styles.mutedSmall}>
            Saved. Repaint to see a changed appearance.
          </p>
        ) : null}
      </div>

      <div className={styles.detailRow}>
        {confirmRelease ? (
          <div className={styles.overwrite} role="alert">
            <p>
              Release {cultivator.name}?
              {climbCount > 0
                ? ` Their ${climbCount} saved ${climbCount === 1 ? "climb ends" : "climbs end"} and earn nothing.`
                : ""}{" "}
              Painted art stays in the workshop.
            </p>
            <div>
              <Button disabled={busy} onClick={release}>
                Release
              </Button>
              <Button onClick={() => setConfirmRelease(false)} variant="quiet">
                Keep them
              </Button>
            </div>
          </div>
        ) : (
          <button
            className={styles.releaseLink}
            onClick={() => {
              playSound("select");
              setConfirmRelease(true);
            }}
            type="button"
          >
            Release this cultivator
          </button>
        )}
      </div>
    </section>
  );
};
