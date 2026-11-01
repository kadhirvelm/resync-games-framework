"use client";

import type { SpriteAnimationAsset } from "@towers-of-coreborn/api";
import clsx from "clsx";
import styles from "./Assets.module.scss";
import { spriteAnimationDisplay } from "./spriteAnimation";

interface SpriteAnimationPlayerProps {
  animation: SpriteAnimationAsset;
  /** Displayed frame height, in CSS pixels */
  displayHeight: number;
  frameHeight: number;
  frameWidth: number;
  /** Plays the animation mirrored, showing the opposite facing */
  mirrored?: boolean;
}

/**
 * Plays one normalized sprite strip in place by stepping its background.
 * Frames are drawn with nearest-neighbor scaling so pixel art stays crisp.
 * @param animation - Strip URL, frame count, and fps
 * @param displayHeight - Height to draw each frame at
 * @param frameWidth - Width of one frame in the strip
 * @param frameHeight - Height of one frame in the strip
 * @param mirrored - Flips the sprite horizontally when true
 */
export function SpriteAnimationPlayer({
  animation,
  displayHeight,
  frameHeight,
  frameWidth,
  mirrored = false,
}: SpriteAnimationPlayerProps) {
  const display = spriteAnimationDisplay({
    displayHeight,
    fps: animation.fps,
    frameCount: animation.frameCount,
    frameHeight,
    frameWidth,
  });

  return (
    <div
      aria-label={`${animation.label} animation`}
      className={clsx(styles.spritePlayer, mirrored && styles.spriteMirrored)}
      role="img"
      style={{
        animationDuration: `${display.durationSeconds}s`,
        animationTimingFunction: display.timingFunction,
        backgroundImage: `url(${JSON.stringify(animation.stripUrl)})`,
        backgroundSize: `${animation.frameCount * 100}% 100%`,
        height: display.height,
        width: display.width,
      }}
    />
  );
}
