"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";
import type { BattleSceneInput } from "./battleAssetRequests";
import { createDynamicGame } from "./createDynamicGame";
import styles from "./phaserGameCanvas.module.scss";

type PhaserGameCanvasProps = {
  /** Battle to run. Mount a new canvas, with a new `key`, for each battle. */
  battle: BattleSceneInput;
  className?: string;
};

/**
 * Client-only mount for one Phaser battle that fills the viewport.
 * The battle reads `battle` once when it boots.
 * @param battle - Party, enemies, deck, room, and the finish callback
 * @param className - Optional class name merged onto the game container
 */
export const PhaserGameCanvas = ({
  battle,
  className,
}: PhaserGameCanvasProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const battleRef = useRef(battle);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) {
      return;
    }
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void (async () => {
      const { destroy: destroyGame } = await createDynamicGame(
        el,
        battleRef.current,
      );
      if (cancelled) {
        destroyGame();
        return;
      }
      destroy = destroyGame;
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return (
    <div className={clsx(styles.layout, className)}>
      <div
        aria-label="Battle"
        className={styles.gameMount}
        ref={parentRef}
        role="application"
      />
    </div>
  );
};
