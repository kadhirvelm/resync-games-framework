"use client";

import { useCallback, useMemo, useState } from "react";
import type { ClimbSummary } from "./logic/progression";
import { createSeed } from "./logic/random";
import {
  abandonRun,
  type BattleReport,
  beginBattle,
  claimReward,
  finishBattle,
  type MergePair,
  mergeCoreborn,
  moveMember,
  type RewardChoice,
  type RunOptions,
  recruitCoreborn,
  rerollReward,
  startRun,
} from "./logic/run";
import type { SavedClimb } from "./logic/saveGame";
import type { RunState, TowerContent } from "./logic/towerTypes";

/** One climb of one tower. */
export interface TowerSession {
  /** Increases with every battle so each fight mounts a fresh canvas */
  battleNumber: number;
  /** Saved-climb id, fixed for the whole climb */
  climbId: string;
  /** Content with the climbing cultivator's identity already applied */
  content: TowerContent;
  cultivatorId: string;
  run: RunState;
  /** Set once a finished climb has been banked into the profile */
  summary?: ClimbSummary;
}

/** Actions the screens can take on the current climb. */
export interface TowerRunActions {
  /** Ends the climb as a defeat on the current floor */
  abandon: () => void;
  beginBattle: () => void;
  claimReward: (choice: RewardChoice) => void;
  finishBattle: (report: BattleReport) => void;
  /** Leaves the climb without ending it. Its save stays. */
  leave: () => void;
  merge: (pair: MergePair) => void;
  moveMember: (fromIndex: number, toIndex: number) => void;
  recruit: (templateId: string) => void;
  rerollReward: () => void;
  /** Continues a saved climb */
  resume: (saved: SavedClimb) => void;
  /** Records what the finished climb earned */
  settle: (summary: ClimbSummary) => void;
  /** Begins a new climb with its own save */
  start: (
    content: TowerContent,
    options: RunOptions,
    cultivatorId: string,
  ) => void;
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
        const run = change(current.run, current.content);
        return run === current.run ? current : { ...current, run };
      });
    },
    [],
  );

  const actions = useMemo<TowerRunActions>(
    () => ({
      abandon: () => updateRun((run) => abandonRun(run)),
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
      leave: () => setSession(null),
      merge: (pair) =>
        updateRun((run, content) => mergeCoreborn(run, content, pair)),
      moveMember: (fromIndex, toIndex) =>
        updateRun((run) => moveMember(run, fromIndex, toIndex)),
      recruit: (templateId) =>
        updateRun((run, content) => recruitCoreborn(run, content, templateId)),
      rerollReward: () =>
        updateRun((run, content) => rerollReward(run, content)),
      resume: (saved) =>
        setSession({
          battleNumber: saved.battleNumber,
          climbId: saved.id,
          content: saved.content,
          cultivatorId: saved.cultivatorId,
          run: saved.run,
        }),
      settle: (summary) =>
        setSession((current) => (current ? { ...current, summary } : current)),
      start: (content, options, cultivatorId) =>
        setSession({
          battleNumber: 0,
          climbId: crypto.randomUUID(),
          content,
          cultivatorId,
          run: startRun(content, createSeed(), options),
        }),
    }),
    [updateRun],
  );

  return { actions, session };
}
