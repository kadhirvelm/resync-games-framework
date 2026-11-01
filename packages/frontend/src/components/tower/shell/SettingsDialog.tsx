import clsx from "clsx";
import { useState } from "react";
import { playSound } from "../audio/sound";
import type { BattleSpeed, GameSettings } from "../logic/settings";
import { Button } from "../parts/Button";
import { Modal } from "./Modal";
import styles from "./shell.module.scss";

const SPEED_LABELS: Record<BattleSpeed, string> = {
  normal: "Normal",
  relaxed: "Relaxed",
  swift: "Swift",
};

interface SettingsDialogProps {
  onClose: () => void;
  /** Clears all progress. Omit to hide the option, such as mid-climb. */
  onEraseAll?: () => void;
  onUpdate: (change: Partial<GameSettings>) => void;
  settings: GameSettings;
}

/**
 * Sound, battle pace, motion, and erasing progress.
 * @param onClose - Closes the dialog
 * @param onEraseAll - Erases the profile, saves, and settings
 * @param onUpdate - Applies one setting change
 * @param settings - Current settings
 * @returns The settings dialog
 */
export const SettingsDialog = ({
  onClose,
  onEraseAll,
  onUpdate,
  settings,
}: SettingsDialogProps) => {
  const [confirmingErase, setConfirmingErase] = useState(false);
  return (
    <Modal onClose={onClose} title="Settings">
      <div className={styles.settingsList}>
        <label className={styles.settingRow}>
          <span>
            <strong>Volume</strong>
            <small>{Math.round(settings.volume * 100)}%</small>
          </span>
          <input
            max={100}
            min={0}
            onChange={(event) =>
              onUpdate({ volume: Number(event.target.value) / 100 })
            }
            onPointerUp={() => playSound("select")}
            type="range"
            value={Math.round(settings.volume * 100)}
          />
        </label>

        <label className={styles.settingRow}>
          <span>
            <strong>Sound</strong>
            <small>Soft chimes for menus and battle</small>
          </span>
          <input
            checked={!settings.muted}
            className={styles.toggle}
            onChange={(event) => {
              onUpdate({ muted: !event.target.checked });
              if (event.target.checked) {
                playSound("confirm");
              }
            }}
            type="checkbox"
          />
        </label>

        <div className={styles.settingRow}>
          <span>
            <strong>Battle speed</strong>
            <small>How quickly turns and enemy actions play out</small>
          </span>
          <div className={styles.segmented}>
            {(Object.keys(SPEED_LABELS) as BattleSpeed[]).map((speed) => (
              <button
                aria-pressed={settings.battleSpeed === speed}
                className={clsx(
                  settings.battleSpeed === speed && styles.segmentActive,
                )}
                key={speed}
                onClick={() => {
                  playSound("select");
                  onUpdate({ battleSpeed: speed });
                }}
                type="button"
              >
                {SPEED_LABELS[speed]}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.settingRow}>
          <span>
            <strong>Reduce motion</strong>
            <small>No drifting leaves, shakes, or long fades</small>
          </span>
          <input
            checked={settings.reducedMotion}
            className={styles.toggle}
            onChange={(event) => {
              playSound("select");
              onUpdate({ reducedMotion: event.target.checked });
            }}
            type="checkbox"
          />
        </label>

        {onEraseAll ? (
          <div className={styles.dangerZone}>
            {confirmingErase ? (
              <>
                <p>
                  Erase every saved climb, all essence and cultivation, and the
                  chronicle? This cannot be undone.
                </p>
                <div>
                  <Button
                    className={styles.dangerButton}
                    onClick={() => {
                      onEraseAll();
                      setConfirmingErase(false);
                      onClose();
                    }}
                  >
                    Erase everything
                  </Button>
                  <Button
                    onClick={() => setConfirmingErase(false)}
                    variant="quiet"
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button onClick={() => setConfirmingErase(true)} variant="quiet">
                Erase all progress…
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
};
