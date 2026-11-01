import { Menu } from "lucide-react";
import { useState } from "react";
import type { BattleSceneInput } from "@/components/phaserGame/battleAssetRequests";
import { PhaserGameCanvas } from "@/components/phaserGame/PhaserGameCanvas";
import { playSound } from "../audio/sound";
import { type BattleReport, combatSetup, currentRoom } from "../logic/run";
import { BATTLE_PACE, type GameSettings } from "../logic/settings";
import type { RunState, TowerContent } from "../logic/towerTypes";
import styles from "../tower.module.scss";

interface RoomBattleProps {
  content: TowerContent;
  onFinish: (report: BattleReport) => void;
  onPause: () => void;
  run: RunState;
  settings: GameSettings;
}

/**
 * Runs the current room's battle on the Phaser canvas with the party in its
 * locked order. The parent mounts a fresh instance for each battle.
 * @param content - Tower content
 * @param onFinish - Receives the battle's outcome and party health
 * @param onPause - Opens the pause menu over the battle
 * @param run - Run in battle
 * @param settings - Battle speed and motion preferences, read at mount
 * @returns The battle canvas and its pause button
 */
export const RoomBattle = ({
  content,
  onFinish,
  onPause,
  run,
  settings,
}: RoomBattleProps) => {
  // The canvas reads its input once, so it is built once; a new battle remounts this component.
  const [battle] = useState<BattleSceneInput>(() => {
    const room = currentRoom(run);
    return {
      onFinish,
      pace: BATTLE_PACE[settings.battleSpeed],
      reducedMotion: settings.reducedMotion,
      room: {
        backdropUrl: room?.scene?.imageUrl,
        floor: room?.floor ?? 1,
        floorCount: run.rooms.length,
        isBoss: room?.isBoss ?? false,
        title: room?.scene?.title ?? "The tower",
      },
      setup: combatSetup(run, content),
    };
  });
  return (
    <>
      <PhaserGameCanvas battle={battle} />
      <button
        aria-label="Pause"
        className={styles.battlePause}
        onClick={() => {
          playSound("select");
          onPause();
        }}
        type="button"
      >
        <Menu size={20} />
      </button>
    </>
  );
};
