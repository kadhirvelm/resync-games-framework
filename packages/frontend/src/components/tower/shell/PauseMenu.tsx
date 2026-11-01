import { useState } from "react";
import { playSound } from "../audio/sound";
import { Button } from "../parts/Button";
import { Modal } from "./Modal";
import styles from "./shell.module.scss";

interface PauseMenuProps {
  /** Whether a battle is running; leaving restarts it on resume */
  inBattle: boolean;
  onAbandon: () => void;
  onClose: () => void;
  onSaveAndQuit: () => void;
  onSettings: () => void;
}

/**
 * The climb's pause menu: resume, settings, save and return to the title,
 * or abandon the climb after a confirmation.
 * @param props - Pause actions
 * @returns The pause menu
 */
export const PauseMenu = ({
  inBattle,
  onAbandon,
  onClose,
  onSaveAndQuit,
  onSettings,
}: PauseMenuProps) => {
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  return (
    <Modal onClose={onClose} title="Paused">
      <div className={styles.pauseList}>
        <Button
          onClick={() => {
            playSound("confirm");
            onClose();
          }}
        >
          Resume
        </Button>
        <Button
          onClick={() => {
            playSound("select");
            onSettings();
          }}
          variant="quiet"
        >
          Settings
        </Button>
        <Button
          onClick={() => {
            playSound("back");
            onSaveAndQuit();
          }}
          variant="quiet"
        >
          Save and return to title
        </Button>
        {inBattle ? (
          <p className={styles.mutedSmall}>
            This battle starts over from its first turn when you return.
          </p>
        ) : null}
        {confirmingAbandon ? (
          <div className={styles.overwrite} role="alert">
            <p>
              Abandon this climb? It ends here, and only the floors already
              cleared count toward essence.
            </p>
            <div>
              <Button
                className={styles.dangerButton}
                onClick={() => {
                  playSound("defeat");
                  onAbandon();
                }}
              >
                Abandon climb
              </Button>
              <Button
                onClick={() => setConfirmingAbandon(false)}
                variant="quiet"
              >
                Keep climbing
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setConfirmingAbandon(true)} variant="quiet">
            Abandon climb…
          </Button>
        )}
      </div>
    </Modal>
  );
};
