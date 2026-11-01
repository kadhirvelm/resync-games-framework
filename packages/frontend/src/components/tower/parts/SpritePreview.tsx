import clsx from "clsx";
import type { UnitSprite, UnitSpriteMove } from "../logic/towerTypes";
import styles from "../shell/shell.module.scss";

interface SpritePreviewProps {
  className?: string;
  /** Height to draw a frame at; width keeps the frame's shape */
  height: number;
  /** Which strip to play. Falls back to idle. */
  move?: UnitSpriteMove;
  name: string;
  /** Hold the first frame instead of playing */
  still?: boolean;
  sprite: UnitSprite;
}

/**
 * Plays one of a battle sprite's strips in a loop, frame by frame, with a
 * CSS `steps()` animation over the strip image.
 * @param className - Extra class
 * @param height - Drawn frame height in pixels
 * @param move - Strip to play; idle when missing
 * @param name - Alt text
 * @param still - Show the first frame only, for reduced motion
 * @param sprite - The battle sprite
 * @returns The animated figure, or nothing when the sprite has no strips
 */
export const SpritePreview = ({
  className,
  height,
  move = "idle",
  name,
  still = false,
  sprite,
}: SpritePreviewProps) => {
  const animation = sprite.animations[move] ?? sprite.animations.idle;
  if (!animation) {
    return null;
  }
  const width = Math.round((height * sprite.frameWidth) / sprite.frameHeight);
  const durationMs = Math.round(
    (animation.frameCount * 1000) / Math.max(1, animation.fps),
  );
  return (
    <span
      aria-label={name}
      className={clsx(
        styles.spritePreview,
        still && styles.spriteStill,
        className,
      )}
      key={animation.stripUrl}
      role="img"
      style={
        {
          "--duration": `${durationMs}ms`,
          "--frames": animation.frameCount,
          "--h": `${height}px`,
          "--strip": `url("${animation.stripUrl}")`,
          "--w": `${width}px`,
        } as React.CSSProperties
      }
    />
  );
};
