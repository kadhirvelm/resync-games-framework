/** Frame timing and size for one sprite strip shown at a chosen height. */
export interface SpriteAnimationDisplay {
  /** Seconds for one pass through every frame */
  durationSeconds: number;
  /** Displayed frame height, in CSS pixels */
  height: number;
  /** CSS `animation-timing-function` that holds each frame, or undefined for one frame */
  timingFunction: string | undefined;
  /** Displayed frame width, in CSS pixels */
  width: number;
}

/**
 * Works out how to play a horizontal sprite strip with a CSS animation that
 * moves `background-position-x` from 0% to 100%. With `steps(n, jump-none)`
 * those two ends are the first and last frames, and each frame is held for
 * `1 / fps` seconds.
 * @param params - Strip frame count and size, playback speed, and display height
 * @returns Display size and timing; a single frame has no timing function
 */
export function spriteAnimationDisplay(params: {
  displayHeight: number;
  fps: number;
  frameCount: number;
  frameHeight: number;
  frameWidth: number;
}): SpriteAnimationDisplay {
  const frameCount = Math.max(1, Math.floor(params.frameCount));
  const fps = params.fps > 0 ? params.fps : 1;
  const width = Math.round(
    (params.displayHeight * params.frameWidth) / params.frameHeight,
  );
  return {
    durationSeconds: frameCount / fps,
    height: params.displayHeight,
    timingFunction:
      frameCount > 1 ? `steps(${frameCount}, jump-none)` : undefined,
    width,
  };
}
