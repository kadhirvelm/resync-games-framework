import { Menu, Shuffle } from "lucide-react";
import { playSound } from "../audio/sound";
import type { RunState, TowerContent } from "../logic/towerTypes";
import { TowerProgress } from "../parts/TowerProgress";
import { ascensionNumeral } from "./formatTime";
import styles from "./shell.module.scss";

interface RunHudProps {
  content: TowerContent;
  onPause: () => void;
  run: RunState;
}

/**
 * The bar across the top of every climb screen: pause, the tower's name and
 * ascension, and the floor track.
 * @param content - Tower content
 * @param onPause - Opens the pause menu
 * @param run - Current climb
 * @returns The HUD
 */
export const RunHud = ({ content, onPause, run }: RunHudProps) => (
  <header className={styles.hud}>
    <button
      aria-label="Pause"
      className={styles.hudPause}
      onClick={() => {
        playSound("select");
        onPause();
      }}
      type="button"
    >
      <Menu size={20} />
    </button>
    <div className={styles.hudTitle}>
      <strong>{content.title}</strong>
      <span>
        {run.ascension > 0
          ? `Ascension ${ascensionNumeral(run.ascension)}`
          : "First ascent"}
        {run.modifiers.rerollsLeft > 0 ? (
          <>
            {" · "}
            <Shuffle size={12} /> {run.modifiers.rerollsLeft}
          </>
        ) : null}
      </span>
    </div>
    <div className={styles.hudTrack}>
      <TowerProgress floorIndex={run.floorIndex} rooms={run.rooms} />
    </div>
  </header>
);
