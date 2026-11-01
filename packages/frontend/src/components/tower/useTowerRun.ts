"use client";

import { useCallback, useMemo, useState } from "react";
import { createSeed } from "./logic/random";
import {
  type BattleReport,
  beginBattle,
  claimReward,
  finishBattle,
  type MergePair,
  mergeCoreborn,
  moveMember,
  type RewardChoice,
  recruitCoreborn,
  startRun,
} from "./logic/run";
import type { RunState, TowerContent } from "./logic/towerTypes";

/** One climb of one tower. */
export interface TowerSession {
  /** Increases with every battle so each fight mounts a fresh canvas */
  battleNumber: number;
  content: TowerContent;
  run: RunState;
}

/** Actions the screens can take on the current climb. */
export interface TowerRunActions {
  beginBattle: () => void;
  claimReward: (choice: RewardChoice) => void;
  finishBattle: (report: BattleReport) => void;
  merge: (pair: MergePair) => void;
  moveMember: (fromIndex: number, toIndex: number) => void;
  /** Leaves the climb and returns to the tower list */
  quit: () => void;
  recruit: (templateId: string) => void;
  /** Starts a fresh climb of the same tower. Nothing carries over. */
  restart: () => void;
  start: (content: TowerContent) => void;
}

/**
 * Holds the current climb and wires the pure run rules to the screens.
 * @returns The session, when a climb is in progress, and the actions on it
 */
export function useTowerRun(): {
  actions: TowerRunActions;
  session: TowerSession | null;
} {
  const [session, setSession] = useState<TowerSession | null>(null);

  /**
   * @param change - Next run from the current run and content
   */
  const updateRun = useCallback(
    (change: (run: RunState, content: TowerContent) => RunState) => {
      setSession((current) => {
        if (!current) {
          return current;
        }
        return { ...current, run: change(current.run, current.content) };
      });
    },
    [],
  );

  const start = useCallback((content: TowerContent) => {
    setSession({
      battleNumber: 0,
      content,
      run: startRun(content, createSeed()),
    });
  }, []);

  const actions = useMemo<TowerRunActions>(
    () => ({
      beginBattle: () =>
        setSession((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            battleNumber: current.battleNumber + 1,
            run: beginBattle(current.run),
          };
        }),
      claimReward: (choice) =>
        updateRun((run, content) => claimReward(run, content, choice)),
      finishBattle: (report) =>
        updateRun((run, content) => finishBattle(run, content, report)),
      merge: (pair) =>
        updateRun((run, content) => mergeCoreborn(run, content, pair)),
      moveMember: (fromIndex, toIndex) =>
        updateRun((run) => moveMember(run, fromIndex, toIndex)),
      quit: () => setSession(null),
      recruit: (templateId) =>
        updateRun((run, content) => recruitCoreborn(run, content, templateId)),
      restart: () =>
        setSession((current) => {
          if (!current) {
            return current;
          }
          return {
            battleNumber: current.battleNumber,
            content: current.content,
            run: startRun(current.content, createSeed()),
          };
        }),
      start,
    }),
    [start, updateRun],
  );

  return { actions, session };
}
