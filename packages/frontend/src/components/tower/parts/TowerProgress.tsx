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
 * @param size - Icon size in pixels
 * @returns Icon for that reward
 */
export function RewardIcon({
  reward,
  size = 15,
}: {
  reward?: RoomRewardKind;
  size?: number;
}) {
  if (reward === "coreborn") {
    return <UserPlus size={size} />;
  }
  if (reward === "health") {
    return <Heart size={size} />;
  }
  if (reward === "monster-cards") {
    return <Layers size={size} />;
  }
  if (reward === "techniques") {
    return <Sparkles size={size} />;
  }
  return <Crown size={size} />;
}

/**
 * The climb as a path of floor nodes joined by a vine that fills as the
 * party climbs. Each node shows its reward; the current one glows.
 * Rooms are linear, so this is a progress track, not a map. A glowing
 * leaf marks the party on the vine and slides up as floors are cleared.
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
  <ol
    aria-label="Tower floors"
    className={styles.progress}
    style={
      {
        "--progress": `${(floorIndex / Math.max(1, rooms.length - 1)) * 100}%`,
      } as React.CSSProperties
    }
  >
    <li aria-hidden="true" className={styles.progressClimber} />
    {rooms.map((room, index) => {
      const label = room.isBoss
        ? "Tower Heart"
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
          <span className={styles.progressNode}>
            <RewardIcon reward={room.reward} size={14} />
          </span>
          <span className={styles.progressNumber}>
            {room.isBoss ? "Summit" : room.floor}
          </span>
        </li>
      );
    })}
  </ol>
);
