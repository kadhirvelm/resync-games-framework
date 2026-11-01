import { useState } from "react";
import { currentRoom, type MergePair, mergeOptions } from "../logic/run";
import type { RunState, TowerContent } from "../logic/towerTypes";
import { Button } from "../parts/Button";
import { DeckList } from "../parts/DeckList";
import { EnemyPreview } from "../parts/EnemyPreview";
import { MergePanel } from "../parts/MergePanel";
import { PartyLineup } from "../parts/PartyLineup";
import { REWARD_LABELS, TowerProgress } from "../parts/TowerProgress";
import styles from "../tower.module.scss";

interface CampScreenProps {
  content: TowerContent;
  onBegin: () => void;
  onMerge: (pair: MergePair) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onQuit: () => void;
  run: RunState;
}

/**
 * Between battles: read the next room, order the party against what its
 * enemies telegraph, merge Coreborn, then lock the order and fight.
 * @param props - Run, content, and camp actions
 * @returns The camp screen
 */
export const CampScreen = ({
  content,
  onBegin,
  onMerge,
  onMove,
  onQuit,
  run,
}: CampScreenProps) => {
  const [showDeck, setShowDeck] = useState(false);
  const room = currentRoom(run);
  if (!room) {
    return null;
  }
  const pairs = mergeOptions(run);
  const reward = room.isBoss
    ? "Beat the Tower Heart to finish the climb."
    : `Reward: ${REWARD_LABELS[room.reward ?? "techniques"]}`;

  return (
    <main className={styles.screen}>
      <div className={styles.campTop}>
        <TowerProgress floorIndex={run.floorIndex} rooms={run.rooms} />
        <Button onClick={onQuit} variant="quiet">
          Abandon climb
        </Button>
      </div>

      <section
        className={styles.roomBanner}
        style={
          room.scene?.imageUrl
            ? ({
                "--room-image": `url("${room.scene.imageUrl}")`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <div className={styles.roomBannerText}>
          <p className={styles.eyebrow}>
            {room.isBoss
              ? "The summit"
              : `Floor ${room.floor} of ${run.rooms.length}`}
          </p>
          <h1>{room.scene?.title ?? "An unnamed floor"}</h1>
          <p>{room.scene?.description}</p>
          <p className={styles.rewardLine}>{reward}</p>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>
          {room.enemies.length === 1
            ? "Waiting on this floor"
            : "Waiting on this floor · they act right to left"}
        </h2>
        <div className={styles.enemyList}>
          {room.enemies.map((enemy) => (
            <EnemyPreview enemy={enemy} key={enemy.id} />
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Party order</h2>
        <p className={styles.muted}>
          Order locks when the battle starts. Front attacks hit the front;
          reaching attacks hit the back; sweeping attacks hit everyone.
        </p>
        <PartyLineup content={content} onMove={onMove} run={run} />
      </section>

      <MergePanel content={content} onMerge={onMerge} pairs={pairs} />

      <section className={styles.panel}>
        <div className={styles.panelHeaderRow}>
          <h2>Deck</h2>
          <Button
            onClick={() => setShowDeck((shown) => !shown)}
            variant="quiet"
          >
            {showDeck ? "Hide cards" : "Show cards"}
          </Button>
        </div>
        {showDeck ? <DeckList content={content} run={run} /> : null}
      </section>

      <div className={styles.stickyAction}>
        <Button className={styles.bigButton} onClick={onBegin}>
          {room.isBoss ? "Face the Tower Heart" : `Enter floor ${room.floor}`}
        </Button>
      </div>
    </main>
  );
};
