import clsx from "clsx";
import { Layers, Swords } from "lucide-react";
import { useState } from "react";
import { playSound } from "../audio/sound";
import {
  currentRoom,
  type MergePair,
  mergeOptions,
  runDeck,
} from "../logic/run";
import type { RunState, TowerContent } from "../logic/towerTypes";
import { Button } from "../parts/Button";
import { DeckList } from "../parts/DeckList";
import { EnemyPreview } from "../parts/EnemyPreview";
import { MergePanel } from "../parts/MergePanel";
import { PartyLineup } from "../parts/PartyLineup";
import { REWARD_LABELS, RewardIcon } from "../parts/TowerProgress";
import { Modal } from "../shell/Modal";
import styles from "../tower.module.scss";

interface CampScreenProps {
  content: TowerContent;
  onBegin: () => void;
  onMerge: (pair: MergePair) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  reducedMotion: boolean;
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
  reducedMotion,
  run,
}: CampScreenProps) => {
  const [showDeck, setShowDeck] = useState(false);
  const room = currentRoom(run);
  if (!room) {
    return null;
  }
  const pairs = mergeOptions(run);
  const deckSize = runDeck(run, content).length;

  return (
    <main className={styles.screen}>
      <section
        className={clsx(styles.roomHero, room.isBoss && styles.roomHeroBoss)}
        style={
          room.scene?.imageUrl
            ? ({
                "--room-image": `url("${room.scene.imageUrl}")`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <div className={styles.roomHeroArt} />
        <div className={styles.roomHeroText}>
          <p className={styles.eyebrow}>
            {room.isBoss
              ? "The summit"
              : `Floor ${room.floor} of ${run.rooms.length}`}
          </p>
          <h1>{room.scene?.title ?? "An unnamed floor"}</h1>
          {room.scene?.description ? <p>{room.scene.description}</p> : null}
          <span className={styles.rewardChip}>
            <RewardIcon reward={room.reward} />
            {room.isBoss
              ? "Quiet the Tower Heart to finish the climb"
              : `Reward · ${REWARD_LABELS[room.reward ?? "techniques"]}`}
          </span>
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
          Drag or use the arrows. Front attacks hit the front; reaching attacks
          hit the back; sweeping attacks hit everyone. Order locks when the
          battle starts.
        </p>
        <PartyLineup
          content={content}
          onMove={onMove}
          reducedMotion={reducedMotion}
          run={run}
        />
      </section>

      <MergePanel content={content} onMerge={onMerge} pairs={pairs} />

      <div className={styles.actionBar}>
        <Button
          className={styles.deckButton}
          onClick={() => {
            playSound("select");
            setShowDeck(true);
          }}
          variant="quiet"
        >
          <Layers size={18} /> Deck · {deckSize}
        </Button>
        <Button className={styles.bigButton} onClick={onBegin}>
          <Swords size={20} />
          {room.isBoss ? "Face the Tower Heart" : `Enter floor ${room.floor}`}
        </Button>
      </div>

      {showDeck ? (
        <Modal onClose={() => setShowDeck(false)} title="Your deck" wide={true}>
          <div className={styles.deckModalBody}>
            <DeckList content={content} run={run} />
          </div>
        </Modal>
      ) : null}
    </main>
  );
};
