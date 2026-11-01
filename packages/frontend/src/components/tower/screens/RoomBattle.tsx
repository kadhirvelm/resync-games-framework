import { useState } from "react";
import type { BattleSceneInput } from "@/components/phaserGame/battleAssetRequests";
import { PhaserGameCanvas } from "@/components/phaserGame/PhaserGameCanvas";
import { type BattleReport, combatSetup, currentRoom } from "../logic/run";
import type { RunState, TowerContent } from "../logic/towerTypes";

interface RoomBattleProps {
  content: TowerContent;
  onFinish: (report: BattleReport) => void;
  run: RunState;
}

/**
 * Runs the current room's battle on the Phaser canvas with the party in its
 * locked order. The parent mounts a fresh instance for each battle.
 * @param content - Tower content
 * @param onFinish - Receives the battle's outcome and party health
 * @param run - Run in battle
 * @returns The battle canvas
 */
export const RoomBattle = ({ content, onFinish, run }: RoomBattleProps) => {
  // The canvas reads its input once, so it is built once; a new battle remounts this component.
  const [battle] = useState<BattleSceneInput>(() => {
    const room = currentRoom(run);
    return {
      onFinish,
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
  return <PhaserGameCanvas battle={battle} />;
};
