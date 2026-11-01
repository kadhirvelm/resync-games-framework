import { Heart, Shield, Swords } from "lucide-react";
import { describeTarget } from "../logic/enemyMoves";
import type { EnemySpawn } from "../logic/towerTypes";
import styles from "../tower.module.scss";
import { UnitPortrait } from "./UnitPortrait";

/**
 * An enemy waiting on the next floor, with its whole repeating cycle.
 * Telegraphing starts before the battle: the party order can answer it.
 * @param enemy - Scaled enemy for the floor
 * @returns The enemy panel
 */
export const EnemyPreview = ({ enemy }: { enemy: EnemySpawn }) => (
  <article className={styles.enemy}>
    <UnitPortrait
      accent={enemy.isBoss ? "#c49a3a" : "#b5543f"}
      name={enemy.name}
      size="medium"
      url={enemy.imageUrl}
    />
    <div className={styles.enemyBody}>
      <h4>{enemy.name}</h4>
      <p className={styles.offerMeta}>
        <span>
          <Heart size={13} /> {enemy.maxHitPoints}
        </span>
        {enemy.isBoss ? (
          <span className={styles.bossTag}>Tower Heart</span>
        ) : null}
      </p>
      <p className={styles.enemyLore}>{enemy.description}</p>
      <ol className={styles.cycle}>
        {enemy.moves.map((move, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the cycle is fixed for a floor
          <li key={index}>
            {move.kind === "attack" ? (
              <Swords size={13} />
            ) : (
              <Shield size={13} />
            )}
            <span>{move.text}</span>
            {move.kind === "attack" ? (
              <em>→ {describeTarget(move.target)}</em>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  </article>
);
