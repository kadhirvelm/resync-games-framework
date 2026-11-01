import clsx from "clsx";
import { Crown, Heart, Layers, Sparkles, UserPlus } from "lucide-react";
import type { RoomRewardKind, TowerRoom } from "../logic/towerTypes";
import styles from "../tower.module.scss";

/** Short names for each room reward. */
export const REWARD_LABELS: Record<RoomRewardKind, string> = {
  coreborn: "New Coreborn",
  health: "Recovery",
  "monster-cards": "Coreborn card",
  techniques: "Technique",
};

/**
 * @param reward - Room reward kind, or none for the boss
 * @returns Icon for that reward
 */
function RewardIcon({ reward }: { reward?: RoomRewardKind }) {
  if (reward === "coreborn") {
    return <UserPlus size={15} />;
  }
  if (reward === "health") {
    return <Heart size={15} />;
  }
  if (reward === "monster-cards") {
    return <Layers size={15} />;
  }
  if (reward === "techniques") {
    return <Sparkles size={15} />;
  }
  return <Crown size={15} />;
}

/**
 * The climb as a row of floors: cleared, current, and what each one rewards.
 * Rooms are linear, so this is a progress track, not a map.
 * @param rooms - Every floor, entrance first
 * @param floorIndex - Index of the current floor
 * @returns The progress track
 */
export const TowerProgress = ({
  floorIndex,
  rooms,
}: {
  floorIndex: number;
  rooms: TowerRoom[];
}) => (
  <ol aria-label="Tower floors" className={styles.progress}>
    {rooms.map((room, index) => {
      const label = room.isBoss
        ? "Boss"
        : REWARD_LABELS[room.reward ?? "techniques"];
      return (
        <li
          aria-current={index === floorIndex ? "step" : undefined}
          className={clsx(
            styles.progressFloor,
            index < floorIndex && styles.progressCleared,
            index === floorIndex && styles.progressCurrent,
            room.isBoss && styles.progressBoss,
          )}
          key={room.floor}
          title={`Floor ${room.floor}: ${label}`}
        >
          <span className={styles.progressNumber}>
            {room.isBoss ? "★" : room.floor}
          </span>
          <span className={styles.progressReward}>
            <RewardIcon reward={room.reward} />
            {label}
          </span>
        </li>
      );
    })}
  </ol>
);
