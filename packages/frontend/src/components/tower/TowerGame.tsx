"use client";

import { useMemo } from "react";
import { buildTowerContent, listTowerChoices } from "./logic/buildTowerContent";
import { CampScreen } from "./screens/CampScreen";
import { RecruitScreen } from "./screens/RecruitScreen";
import { RewardScreen } from "./screens/RewardScreen";
import { RoomBattle } from "./screens/RoomBattle";
import { RunEndScreen } from "./screens/RunEndScreen";
import { TitleScreen } from "./screens/TitleScreen";
import styles from "./tower.module.scss";
import { useTowerCatalog } from "./useTowerCatalog";
import { useTowerRun } from "./useTowerRun";

/**
 * The whole game: pick a tower, draft Coreborn, then camp, battle, and claim
 * rewards floor by floor until the summit or the cultivator's fall.
 * @returns The screen for the current phase of the climb
 */
export const TowerGame = () => {
  const { catalog, isLoading, warnings } = useTowerCatalog();
  const { actions, session } = useTowerRun();
  const choices = useMemo(() => listTowerChoices(catalog), [catalog]);

  if (!session) {
    return (
      <div className={styles.page}>
        <TitleScreen
          choices={choices}
          isLoading={isLoading}
          onClimb={(choice) =>
            actions.start(buildTowerContent(choice, catalog))
          }
          warnings={warnings}
        />
      </div>
    );
  }

  const { content, run } = session;
  if (run.phase === "battle") {
    return (
      <RoomBattle
        content={content}
        key={session.battleNumber}
        onFinish={actions.finishBattle}
        run={run}
      />
    );
  }
  return (
    <div className={styles.page}>
      {run.phase === "recruit" ? (
        <RecruitScreen
          content={content}
          onRecruit={actions.recruit}
          run={run}
        />
      ) : null}
      {run.phase === "camp" ? (
        <CampScreen
          content={content}
          onBegin={actions.beginBattle}
          onMerge={actions.merge}
          onMove={actions.moveMember}
          onQuit={actions.quit}
          run={run}
        />
      ) : null}
      {run.phase === "reward" ? (
        <RewardScreen
          content={content}
          onClaim={actions.claimReward}
          run={run}
        />
      ) : null}
      {run.phase === "victory" || run.phase === "defeat" ? (
        <RunEndScreen
          content={content}
          onQuit={actions.quit}
          onRestart={actions.restart}
          run={run}
        />
      ) : null}
    </div>
  );
};
