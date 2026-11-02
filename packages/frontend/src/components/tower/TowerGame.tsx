"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import { playSound } from "./audio/sound";
import { buildTowerContent, listTowerChoices } from "./logic/buildTowerContent";
import { cultivatorDefinition, withCultivator } from "./logic/cultivators";
import {
  nextUpgradeCost,
  purchaseUpgrade,
  runOptionsFor,
  UPGRADES,
  type UpgradeId,
} from "./logic/progression";
import { findTemplate, type MergePair, type RewardChoice } from "./logic/run";
import { type SavedClimb, sortedClimbs } from "./logic/saveGame";
import type { TierNumber, TowerContent } from "./logic/towerTypes";
import { CampScreen } from "./screens/CampScreen";
import { RecruitScreen } from "./screens/RecruitScreen";
import { RewardScreen } from "./screens/RewardScreen";
import { RoomBattle } from "./screens/RoomBattle";
import { RunEndScreen } from "./screens/RunEndScreen";
import { AmbientBackdrop } from "./shell/AmbientBackdrop";
import { ChronicleScreen } from "./shell/ChronicleScreen";
import { CultivationScreen } from "./shell/CultivationScreen";
import { CultivatorScreen, NEW_CULTIVATOR } from "./shell/CultivatorScreen";
import { Curtain } from "./shell/Curtain";
import { MainMenu } from "./shell/MainMenu";
import { MergeCelebration } from "./shell/MergeCelebration";
import { PauseMenu } from "./shell/PauseMenu";
import { RunHud } from "./shell/RunHud";
import { SettingsDialog } from "./shell/SettingsDialog";
import { TowerSelectScreen } from "./shell/TowerSelectScreen";
import styles from "./tower.module.scss";
import { useCurtain } from "./useCurtain";
import { useGameData } from "./useGameData";
import { useTowerCatalog } from "./useTowerCatalog";
import { useTowerRun } from "./useTowerRun";

/** Screens reachable from the title when no climb is open. */
type ShellScreen =
  | "menu"
  | "towers"
  | "cultivators"
  | "cultivation"
  | "chronicle";

/**
 * The whole game: the title menu, cultivators, tower select, cultivation,
 * and chronicle between climbs; recruit, camp, battle, and rewards during
 * one. Every climb is made by one of the player's cultivators and saves to
 * the server after every change; a finished climb pays out Jade Essence.
 * @returns The current screen with its overlays
 */
export const TowerGame = () => {
  const { catalog, isLoading, warnings } = useTowerCatalog();
  const { actions, session } = useTowerRun();
  const data = useGameData(session, actions);
  const { player, profile, setProfile, settings } = data;
  const { climbs: saves, cultivators } = player;
  const curtain = useCurtain(settings.reducedMotion);
  const { cover } = curtain;
  const [screen, setScreen] = useState<ShellScreen>("menu");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [chosenCultivatorId, setChosenCultivatorId] = useState<string>();
  const [cultivatorSelection, setCultivatorSelection] = useState<string>();
  const [celebration, setCelebration] = useState<{
    templateId: string;
    tier: TierNumber;
  }>();

  const entries = useMemo(
    () =>
      listTowerChoices(catalog).map((choice) => ({
        choice,
        content: buildTowerContent(choice, catalog),
      })),
    [catalog],
  );
  const latestSave = sortedClimbs(saves)[0];
  const climberId =
    cultivators.find((entry) => entry.id === chosenCultivatorId)?.id ??
    cultivators.find((entry) => entry.id === latestSave?.cultivatorId)?.id ??
    cultivators[0]?.id;
  const canCultivate = UPGRADES.some((upgrade) => {
    const cost = nextUpgradeCost(profile, upgrade.id);
    return cost !== undefined && profile.essence >= cost;
  });

  /**
   * @param next - Title screen to fade to
   */
  const go = useCallback(
    (next: ShellScreen) => cover(() => setScreen(next)),
    [cover],
  );
  const toMenu = useCallback(() => go("menu"), [go]);

  /**
   * @param selection - Cultivator to open, or the creation form
   */
  const toCultivators = (selection?: string) => {
    setCultivatorSelection(selection);
    go("cultivators");
  };

  /** New climbs need a cultivator, so a player without one creates one first. */
  const toNewClimb = () => {
    if (player.status === "ready" && cultivators.length === 0) {
      toCultivators(NEW_CULTIVATOR);
      return;
    }
    go("towers");
  };

  /**
   * Starts a climb as the chosen cultivator, wearing their name and art.
   * @param content - Tower to climb
   * @param ascension - Chosen ascension
   */
  const startClimb = (content: TowerContent, ascension: number) => {
    const climber = cultivators.find((entry) => entry.id === climberId);
    if (!climber) {
      toCultivators(NEW_CULTIVATOR);
      return;
    }
    cover(() =>
      actions.start(
        withCultivator(content, cultivatorDefinition(climber)),
        runOptionsFor(profile, ascension),
        climber.id,
      ),
    );
  };

  /**
   * Continues a climb with its cultivator's current name and art, which may
   * have been repainted since it was saved.
   * @param saved - Climb to continue
   */
  const resumeClimb = (saved: SavedClimb) => {
    const climber = cultivators.find(
      (entry) => entry.id === saved.cultivatorId,
    );
    const content = climber
      ? withCultivator(saved.content, cultivatorDefinition(climber))
      : saved.content;
    cover(() => actions.resume({ ...saved, content }));
  };

  /**
   * Leaves the current climb for a title screen.
   * @param next - Where to land
   */
  const leaveClimb = (next: ShellScreen) => {
    setPaused(false);
    cover(() => {
      actions.leave();
      setScreen(next);
    });
  };

  /**
   * The reward screen has already celebrated the pick.
   * @param choice - Reward pick, or skip
   */
  const claim = (choice: RewardChoice) =>
    cover(() => actions.claimReward(choice));

  /**
   * @param pair - Merge to make
   */
  const merge = (pair: MergePair) => {
    playSound("merge");
    actions.merge(pair);
    setCelebration({ templateId: pair.templateId, tier: pair.resultTier });
  };

  /**
   * @param id - Upgrade to rank up
   */
  const purchase = (id: UpgradeId) =>
    setProfile((current) => purchaseUpgrade(current, id));

  const closeCelebration = useCallback(() => setCelebration(undefined), []);
  const settingsDialog = settingsOpen ? (
    <SettingsDialog
      onClose={() => setSettingsOpen(false)}
      onEraseAll={session ? undefined : data.eraseAll}
      onUpdate={data.updateSettings}
      settings={settings}
    />
  ) : null;
  const curtainLayer = (
    <Curtain durationMs={curtain.durationMs} state={curtain.state} />
  );

  if (!session) {
    return (
      <div
        className={clsx(
          styles.page,
          settings.reducedMotion && styles.reducedMotion,
        )}
        data-reduced-motion={settings.reducedMotion || undefined}
      >
        {screen === "menu" ? (
          <MainMenu
            canCultivate={canCultivate}
            cultivatorCount={cultivators.length}
            latestSave={latestSave}
            latestSaveClimber={
              cultivators.find((entry) => entry.id === latestSave?.cultivatorId)
                ?.name
            }
            onChronicle={() => go("chronicle")}
            onContinue={resumeClimb}
            onCultivation={() => go("cultivation")}
            onCultivators={() => toCultivators()}
            onNewClimb={toNewClimb}
            onRetryPlayer={player.reload}
            onSettings={() => setSettingsOpen(true)}
            playerError={
              player.status === "error" ? player.loadError : undefined
            }
            profile={profile}
            reducedMotion={settings.reducedMotion}
            saveCount={Object.keys(saves).length}
          />
        ) : (
          <>
            <AmbientBackdrop
              reducedMotion={settings.reducedMotion}
              variant="paper"
            />
            <div className={styles.screenEnter} key={screen}>
              {screen === "towers" ? (
                <TowerSelectScreen
                  climbs={saves}
                  cultivators={cultivators}
                  entries={entries}
                  isLoading={isLoading}
                  onAbandon={player.removeClimb}
                  onBack={toMenu}
                  onManageCultivators={toCultivators}
                  onResume={resumeClimb}
                  onSelectCultivator={setChosenCultivatorId}
                  onStart={startClimb}
                  profile={profile}
                  selectedCultivatorId={climberId}
                  warnings={warnings}
                />
              ) : null}
              {screen === "cultivators" ? (
                <CultivatorScreen
                  climbs={saves}
                  initialSelection={cultivatorSelection}
                  onBack={toMenu}
                  onClimb={(cultivatorId) => {
                    setChosenCultivatorId(cultivatorId);
                    go("towers");
                  }}
                  player={player}
                  reducedMotion={settings.reducedMotion}
                />
              ) : null}
              {screen === "cultivation" ? (
                <CultivationScreen
                  onBack={toMenu}
                  onPurchase={purchase}
                  profile={profile}
                />
              ) : null}
              {screen === "chronicle" ? (
                <ChronicleScreen onBack={toMenu} profile={profile} />
              ) : null}
            </div>
          </>
        )}
        {settingsDialog}
        {curtainLayer}
      </div>
    );
  }

  const { content, run } = session;
  const isOver = run.phase === "victory" || run.phase === "defeat";
  const celebrated = celebration
    ? findTemplate(content, celebration.templateId)
    : undefined;
  const pauseMenu =
    paused && !settingsOpen ? (
      <PauseMenu
        inBattle={run.phase === "battle"}
        onAbandon={() => {
          setPaused(false);
          actions.abandon();
        }}
        onClose={() => setPaused(false)}
        onSaveAndQuit={() => leaveClimb("menu")}
        onSettings={() => setSettingsOpen(true)}
      />
    ) : null;

  if (run.phase === "battle") {
    return (
      <>
        <RoomBattle
          content={content}
          key={session.battleNumber}
          onFinish={actions.finishBattle}
          onPause={() => setPaused(true)}
          run={run}
          settings={settings}
        />
        {pauseMenu}
        {settingsDialog}
        {curtainLayer}
      </>
    );
  }

  return (
    <div
      className={clsx(
        styles.page,
        settings.reducedMotion && styles.reducedMotion,
      )}
      data-reduced-motion={settings.reducedMotion || undefined}
    >
      <AmbientBackdrop reducedMotion={settings.reducedMotion} variant="paper" />
      {isOver ? null : (
        <RunHud content={content} onPause={() => setPaused(true)} run={run} />
      )}
      <div
        className={styles.screenEnter}
        key={`${run.phase}-${run.floorIndex}`}
      >
        {run.phase === "recruit" ? (
          <RecruitScreen
            content={content}
            onRecruit={(templateId) => {
              playSound("confirm");
              actions.recruit(templateId);
            }}
            reducedMotion={settings.reducedMotion}
            run={run}
          />
        ) : null}
        {run.phase === "camp" ? (
          <CampScreen
            content={content}
            onBegin={() => {
              playSound("climb");
              cover(actions.beginBattle);
            }}
            onMerge={merge}
            onMove={actions.moveMember}
            reducedMotion={settings.reducedMotion}
            run={run}
          />
        ) : null}
        {run.phase === "reward" ? (
          <RewardScreen
            content={content}
            onClaim={claim}
            onReroll={actions.rerollReward}
            reducedMotion={settings.reducedMotion}
            run={run}
          />
        ) : null}
        {isOver ? (
          <RunEndScreen
            content={content}
            onCultivate={() => leaveClimb("cultivation")}
            onQuit={() => leaveClimb("menu")}
            onRestart={() => {
              playSound("climb");
              cover(() =>
                actions.start(
                  content,
                  runOptionsFor(profile, run.ascension),
                  session.cultivatorId,
                ),
              );
            }}
            reducedMotion={settings.reducedMotion}
            run={run}
            summary={session.summary}
          />
        ) : null}
      </div>
      {celebrated && celebration ? (
        <MergeCelebration
          onDone={closeCelebration}
          reducedMotion={settings.reducedMotion}
          template={celebrated}
          tier={celebration.tier}
        />
      ) : null}
      {pauseMenu}
      {settingsDialog}
      {curtainLayer}
    </div>
  );
};
