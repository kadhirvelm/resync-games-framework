/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { footprintCovers, footprintSide } from "../logic/economy/footprint";
import type { SimSpeed } from "../logic/sim/constants";
import type { Command, FormationId, SimSnapshot } from "../logic/types";
import { BuildMenu } from "./BuildMenu";
import { CommandCard } from "./CommandCard";
import {
  buildCardButtons,
  type CardButton,
  type ConfirmIntent,
  costStock,
  isConfirmIntent,
  primaryUnit,
} from "./card";
import { activeCoach, type CoachMarkId } from "./coach";
import { buildConfirm } from "./confirm";
import { DescentBabylonViewport } from "./DescentBabylonViewport";
import { DescentLoadingScreen } from "./DescentLoadingScreen";
import styles from "./descentView.module.scss";
import {
  CoachMark,
  CommitDialog,
  GlossaryDialog,
  HotkeyDialog,
  ToastList,
} from "./dialogs";
import type { HotkeyAction } from "./hotkeys";
import {
  describeSelection,
  type InspectTarget,
  pruneInspectTarget,
} from "./inspect";
import {
  EMPTY_LOADING_PROGRESS,
  type LoadingProgress,
} from "./loadingProgress";
import type { CameraFocusRequest } from "./MapViewport";
import type { BuildReadout } from "./presentation";
import {
  type Camera,
  EMPTY_SELECTION,
  idleVillagerIds,
  type MapPoint,
  nextIdleVillager,
  nextUnitSelection,
  placementBuilders,
  pruneSelection,
  rallyCommand,
  type Selection,
  selectionGroups,
  snapMapCell,
} from "./selection";
import { buildShellModel, type ShellModel } from "./shellModel";
import {
  growingCrops,
  ResourceBar,
  StrategicStatus,
  TrainingTracker,
} from "./status";
import type { ResourceSelectionId } from "./text";
import { type HoldUpgradeProgress, UnitPanel } from "./UnitPanel";
import { useHotkeys } from "./useHotkeys";

/** Matches the loading screen's fade-out in `loadingScreen.module.scss`. */
const LOADING_FADE_MS = 520;

/** Opening load: covered, fading out, then gone. */
type LoadPhase = "done" | "leaving" | "loading";

/** Props for the Descent desktop shell. */
export interface DescentViewProps {
  /** Whether the page is fullscreen. */
  fullscreen?: boolean;
  /** Enters or leaves fullscreen. Omit when the browser cannot. */
  onToggleFullscreen?: () => void;
  /** Clears the slice autosave and starts Ashen Gate from tick zero. */
  onRestart?: () => void;
  /** Asks the sim to pause or resume. The button follows `snapshot.paused`. */
  onSetPaused?: (paused: boolean) => void;
  /** Asks the sim to change how many ticks advance per frame. */
  onSetSpeed?: (speed: SimSpeed) => void;
  /** Enables or mutes Descent's generated mix. */
  onSetSoundEnabled?: (enabled: boolean) => void;
  /**
   * Hero Hall revive. The shared command queue has no revive command, so this
   * stays a separate callback.
   */
  onRevive?: (heroId: string, hallId: string) => void;
  /** Fired when the player dismisses an Ashen Gate coach mark. */
  onDismissCoach?: (mark: CoachMarkId) => void;
  /** Player action. The parent enqueues it; this view does not apply it. */
  onCommand?: (command: Command) => void;
  /**
   * Fired once when the battlefield's models and paintings have loaded and
   * the loading screen starts to lift. The parent starts the sim clock here.
   */
  onLoaded?: () => void;
  /** Frozen sim snapshot. Panels only read it. */
  snapshot: SimSnapshot;
  /** Whether the generated mix is audible. */
  soundEnabled?: boolean;
}

interface Toast {
  id: number;
  message: string;
}

/** Maximum notices allowed to cover the battlefield at once. */
const MAX_VISIBLE_TOASTS = 2;

let toastSequence = 0;

/**
 * Allocates a toast id.
 * @returns The next id
 */
function nextToastId(): number {
  toastSequence += 1;
  return toastSequence;
}

/**
 * Adds notices while keeping only the newest compact stack.
 * @param current - Notices already visible
 * @param incoming - New notices to append
 * @returns At most `MAX_VISIBLE_TOASTS` newest notices
 */
function appendToasts(current: Toast[], incoming: Toast[]): Toast[] {
  return [...current, ...incoming].slice(-MAX_VISIBLE_TOASTS);
}

/**
 * Status line while a building is waiting for a map click.
 * @param option - Building being placed
 * @param onVein - Whether the cursor is on a Spirit Vein
 * @returns The status text, or null when nothing is being placed
 */
function placementStatus(
  option: BuildReadout | null,
  onVein: boolean,
): string | null {
  if (option === null) return null;
  if (onVein) {
    return `${option.name} · Spirit Vein`;
  }
  return option.name;
}

/**
 * @param model - Shell model
 * @returns The paid-for Hold upgrade that is under way, or null
 */
function runningHoldUpgrade(model: ShellModel): HoldUpgradeProgress | null {
  const upgrade = model.holdUpgrade;
  const running = upgrade?.inProgress ?? null;
  if (upgrade === null || running === null) return null;
  return { ...running, targetTier: upgrade.targetTier };
}

/**
 * Adds the active formation to a grouped movement order.
 * @param command - Command emitted by the battlefield input adapter
 * @param formation - Player-selected military formation
 * @returns The command with formation metadata when it moves a group
 */
function applyFormation(command: Command, formation: FormationId): Command {
  if (command.type !== "order_move" && command.type !== "order_attack_move") {
    return command;
  }
  if (command.unitIds.length < 2) return command;
  return { ...command, formation };
}

/**
 * Desktop RTS shell for Descent. It reads a sim snapshot, keeps selection and
 * camera locally, and emits commands. It does not advance ticks or apply rules.
 * @param props - Snapshot and the callbacks that talk to the sim
 * @returns The shell
 */
export function DescentView({
  fullscreen = false,
  onCommand,
  onDismissCoach,
  onLoaded,
  onRevive,
  onRestart,
  onSetPaused,
  onSetSpeed,
  onSetSoundEnabled,
  onToggleFullscreen,
  snapshot,
  soundEnabled = true,
}: DescentViewProps) {
  const model = useMemo(() => buildShellModel(snapshot), [snapshot]);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [inspected, setInspected] = useState<InspectTarget | null>(null);
  const [focusRequest, setFocusRequest] = useState<CameraFocusRequest | null>(
    null,
  );
  const focusSequence = useRef(0);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const [buildOpen, setBuildOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [formation, setFormation] = useState<FormationId>("ranks");
  const [placing, setPlacing] = useState<string | null>(null);
  const [rallying, setRallying] = useState<string | null>(null);
  const [intent, setIntent] = useState<ConfirmIntent | null>(null);
  const [tradeAmount, setTradeAmount] = useState(1);
  const [cursor, setCursor] = useState<MapPoint | null>(null);
  const [dismissed, setDismissed] = useState<CoachMarkId[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loadProgress, setLoadProgress] = useState<LoadingProgress>(
    EMPTY_LOADING_PROGRESS,
  );
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("loading");
  const villagerWasSelected = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  /** Lifts the loading screen once, whether loading finished or was skipped. */
  const revealBattlefield = () =>
    setLoadPhase((phase) => (phase === "loading" ? "leaving" : phase));

  useEffect(() => {
    if (loadPhase !== "leaving") return;
    onLoadedRef.current?.();
    const timer = setTimeout(() => setLoadPhase("done"), LOADING_FADE_MS);
    return () => clearTimeout(timer);
  }, [loadPhase]);
  const pruned = pruneSelection(selection, model);
  if (pruned !== selection) setSelection(pruned);
  const hasSelectedVillager = model.units.some(
    (unit) =>
      unit.classId === "villager" &&
      unit.factionId === "hold" &&
      selection.unitIds.includes(unit.id),
  );
  useEffect(() => {
    const lostVillagerSelection =
      villagerWasSelected.current && !hasSelectedVillager;
    villagerWasSelected.current = hasSelectedVillager;
    if (lostVillagerSelection) setBuildOpen(false);
  }, [hasSelectedVillager]);

  const seenNotices = useRef(new Set<string>());
  const noticeKey = model.notices
    .map((notice) => `${notice.id}:${notice.text}`)
    .join("\n");
  useEffect(() => {
    const fresh = noticeKey
      .split("\n")
      .filter((entry) => entry.length > 0 && !seenNotices.current.has(entry));
    if (fresh.length === 0) return;
    for (const entry of fresh) seenNotices.current.add(entry);
    setToasts((current) =>
      appendToasts(
        current,
        fresh.map((entry) => ({
          id: nextToastId(),
          message: entry.slice(entry.indexOf(":") + 1),
        })),
      ),
    );
  }, [noticeKey]);

  /**
   * @param message - Failure text to show
   */
  const pushToast = (message: string) => {
    setToasts((current) =>
      appendToasts(current, [{ id: nextToastId(), message }]),
    );
  };

  const confirm =
    intent === null ? null : buildConfirm(model, intent, tradeAmount);
  const placingOption =
    model.buildOptions.find((option) => option.buildingType === placing) ??
    null;
  const placementCell = cursor === null ? null : snapMapCell(cursor);
  const placingFootprint = placing === null ? 1 : footprintSide(placing);
  const onVein =
    placing !== null &&
    placementCell !== null &&
    model.veins.some((vein) =>
      footprintCovers(
        { buildingType: placing, ...placementCell },
        vein.x,
        vein.y,
      ),
    );
  const primary = primaryUnit(model, selection);
  const selectedBuilding =
    model.buildings.find((building) => building.id === selection.buildingId) ??
    null;
  const unitGroups = selectionGroups(model.units, selection.unitIds);
  const inspectTarget = pruneInspectTarget(model, inspected);
  const selectionCard = describeSelection(model, selection, inspectTarget);
  const cardButtons = buildCardButtons(
    model,
    selection,
    inspectTarget,
    formation,
  );
  const selectedResource =
    inspectTarget?.kind === "stockpile" ? inspectTarget.resource : null;
  const rallyBuildingId =
    selectedBuilding !== null &&
    !selectedBuilding.constructing &&
    (selectedBuilding.buildingType === "camp" ||
      selectedBuilding.buildingType === "barracks")
      ? selectedBuilding.id
      : null;
  const primaryCultivation = primary?.cultivation ?? null;
  const schoolChoiceVisible =
    primaryCultivation !== null &&
    primaryCultivation.rank === "Sworn" &&
    primaryCultivation.school === undefined;
  const coach = activeCoach({
    dismissed,
    feedOpen: intent?.type === "feed",
    flags: model.onboarding,
    furnaceSelected: model.buildings.some(
      (building) =>
        building.id === selection.buildingId &&
        building.buildingType === "alchemy_furnace",
    ),
    holdUnitPresent: model.units.some((unit) => unit.factionId === "hold"),
    layerName: model.banner.name,
    schoolChoiceVisible,
  });
  /** Selects one building and clears mutually exclusive map intents. */
  const selectBuilding = (id: string) => {
    setRallying(null);
    setPlacing(null);
    setInspected(null);
    setSelection({ buildingId: id, unitIds: [] });
  };

  /**
   * Inspects a map feature or stockpile entry in place of the unit or
   * building selection. Choosing the same stockpile entry again clears it.
   * @param target - Feature or stockpile entry to inspect
   */
  const inspect = (target: InspectTarget) => {
    setRallying(null);
    setPlacing(null);
    setSelection(EMPTY_SELECTION);
    setInspected((current) =>
      current?.kind === "stockpile" &&
      target.kind === "stockpile" &&
      current.resource === target.resource
        ? null
        : target,
    );
  };

  /** Selects a stockpile entry from the resource bar. */
  const selectResource = (resource: ResourceSelectionId) => {
    inspect({ kind: "stockpile", resource });
  };

  /**
   * Selects the next idle villager and centers the camera on it, cycling
   * through idle villagers on repeated presses.
   */
  const selectIdleVillager = () => {
    const id = nextIdleVillager(idleVillagerIds(model.units), selection);
    const villager = model.units.find((unit) => unit.id === id);
    if (id === null || villager === undefined) {
      pushToast("No idle villagers.");
      return;
    }
    setRallying(null);
    setPlacing(null);
    setInspected(null);
    setSelection({ buildingId: null, unitIds: [id] });
    focusSequence.current += 1;
    setFocusRequest({
      id: focusSequence.current,
      point: { x: villager.x, y: villager.y },
    });
  };

  /** Clears every selection and inspected feature. */
  const clearSelection = () => {
    setInspected(null);
    setSelection(EMPTY_SELECTION);
  };

  /**
   * @param button - Command-card button the player pressed
   */
  const activate = (button: CardButton) => {
    const next = button.intent;
    if (next.type === "build") {
      setBuildOpen((open) => !open);
      return;
    }
    if (next.type === "hotkeys") {
      setHotkeysOpen(true);
      return;
    }
    if (next.type === "formation") {
      if (next.formation === formation) return;
      setFormation(next.formation);
      onCommand?.({
        formation: next.formation,
        type: "set_formation",
        unitIds: next.unitIds,
      });
      return;
    }
    if (next.type === "gather_idle") {
      const idle = idleVillagerIds(model.units);
      const unitIds = next.count === "one" ? idle.slice(0, 1) : idle;
      if (unitIds.length === 0) {
        pushToast("No idle villagers.");
        return;
      }
      onCommand?.({ nodeId: next.nodeId, type: "assign_gather", unitIds });
      return;
    }
    if (next.type === "rally") {
      setPlacing(null);
      setRallying(next.buildingId);
      return;
    }
    if (next.type === "recall") {
      onCommand?.({ type: "recall_villagers" });
      return;
    }
    if (next.type === "release") {
      onCommand?.({ type: "release_villagers" });
      return;
    }
    if (next.type === "stop") {
      onCommand?.({ type: "order_stop", unitIds: next.unitIds });
      return;
    }
    if (next.type === "train") {
      onCommand?.({
        buildingId: next.buildingId,
        classId: next.classId,
        ...(next.count !== undefined && next.count > 1
          ? { count: next.count }
          : {}),
        type: "train_unit",
      });
      return;
    }
    if (next.type === "idle") {
      selectIdleVillager();
      return;
    }
    if (next.type === "descend" && !model.bossGateCleared) {
      pushToast("Boss still lives");
      return;
    }
    if (isConfirmIntent(next)) setIntent(next);
  };

  /**
   * @param action - Hotkey the player pressed
   */
  const onHotkey = (action: HotkeyAction) => {
    if (action.type === "pause") {
      onSetPaused?.(!model.paused);
      return;
    }
    if (action.type === "fullscreen") {
      onToggleFullscreen?.();
      return;
    }
    if (action.type === "camera") {
      setCamera((current) => ({
        x: Math.max(0, current.x + action.x),
        y: Math.max(0, current.y + action.y),
      }));
      return;
    }
    if (action.type === "close") {
      if (glossaryOpen) {
        setGlossaryOpen(false);
        return;
      }
      if (intent !== null) {
        setIntent(null);
        return;
      }
      if (buildOpen) {
        setBuildOpen(false);
        return;
      }
      if (hotkeysOpen) {
        setHotkeysOpen(false);
        return;
      }
      if (rallying !== null) {
        setRallying(null);
        return;
      }
      if (placing !== null) {
        setPlacing(null);
        return;
      }
      clearSelection();
      return;
    }
    if (glossaryOpen || intent !== null) return;
    if (action.type === "build") {
      setBuildOpen((open) => !open);
      return;
    }
    if (action.type === "hotkeys") {
      setHotkeysOpen(true);
      return;
    }
    if (action.type === "recall") {
      onCommand?.({ type: "recall_villagers" });
      return;
    }
    if (action.type === "release") {
      onCommand?.({ type: "release_villagers" });
      return;
    }
    if (action.type === "idle") {
      selectIdleVillager();
      return;
    }
    if (action.type === "selectCamp") {
      const camp = model.buildings.find(
        (item) => item.buildingType === "camp" && item.factionId === "hold",
      );
      if (camp !== undefined) {
        setInspected(null);
        setSelection({ buildingId: camp.id, unitIds: [] });
      }
      return;
    }
    const option = model.trainOptions.find(
      (item) => item.buildingId === selection.buildingId,
    );
    if (option === undefined) {
      pushToast("Select the Camp or a Barracks to train.");
      return;
    }
    if (!option.allowed) {
      pushToast(option.reason ?? "Cannot train right now.");
      return;
    }
    const building = { id: option.buildingId };
    onCommand?.({
      buildingId: building.id,
      classId: option.classId,
      type: "train_unit",
    });
  };
  useHotkeys((action) => {
    if (loadPhase === "loading") return;
    onHotkey(action);
  });

  /**
   * Commits the open confirm step, or explains why it cannot.
   */
  const commit = () => {
    if (confirm === null) return;
    if (confirm.blockedMessage !== null) {
      pushToast(confirm.blockedMessage);
      return;
    }
    if (confirm.command !== null) {
      onCommand?.(confirm.command);
      setIntent(null);
      return;
    }
    if (confirm.revive !== null) {
      onRevive?.(confirm.revive.heroId, confirm.revive.hallId);
      setIntent(null);
    }
  };

  /**
   * @param option - Building the player chose from the menu
   */
  const chooseBuilding = (option: BuildReadout) => {
    if (!option.unlocked) {
      pushToast(option.lockedReason ?? "That building is tier-locked.");
      return;
    }
    setPlacing(option.buildingType);
    setRallying(null);
    setBuildOpen(false);
  };

  const stock = costStock(model);
  const holdUpgradeProgress = runningHoldUpgrade(model);
  const hasActiveTraining =
    holdUpgradeProgress !== null ||
    model.buildings.some((building) => building.trainingQueue.length > 0) ||
    growingCrops(model.buildings).length > 0;

  return (
    <div
      className={styles.shell}
      data-has-training={hasActiveTraining}
      data-paused={model.paused}
      data-testid="descent-view"
    >
      <h1 className={styles.srOnly}>Descent</h1>
      <div className={styles.topHud} data-testid="descent-top-hud">
        <ResourceBar
          fullscreen={fullscreen}
          model={model}
          onSelectResource={selectResource}
          onSetPaused={onSetPaused}
          onSetSoundEnabled={onSetSoundEnabled}
          onSetSpeed={onSetSpeed}
          onToggleFullscreen={onToggleFullscreen}
          selectedResource={selectedResource}
          soundEnabled={soundEnabled}
        />
      </div>
      <div className={styles.stage}>
        <DescentBabylonViewport
          camera={camera}
          focusRequest={focusRequest}
          inspected={inspectTarget}
          model={model}
          onCameraChange={setCamera}
          onCommand={(command) =>
            onCommand?.(applyFormation(command, formation))
          }
          onCursor={setCursor}
          onInspect={inspect}
          onLoaded={revealBattlefield}
          onLoadProgress={setLoadProgress}
          onPlace={(point) => {
            if (placing === null) return;
            const cell = snapMapCell(point);
            onCommand?.({
              builderIds: placementBuilders(model.units, selection),
              buildingType: placing,
              type: "place_building",
              x: cell.x,
              y: cell.y,
            });
            setPlacing(null);
          }}
          onSelectBuilding={selectBuilding}
          onSelectUnits={(ids, mode) => {
            setRallying(null);
            setPlacing(null);
            setInspected(null);
            setSelection((current) => nextUnitSelection(current, ids, mode));
          }}
          onSetRally={(point) => {
            const buildingId = rallying ?? rallyBuildingId;
            if (buildingId === null) return;
            onCommand?.(rallyCommand(buildingId, point, model.nodes));
            setRallying(null);
          }}
          placing={placing !== null}
          placingFootprint={placingFootprint}
          rallyBuildingId={rallyBuildingId}
          selection={selection}
          settingRally={rallying !== null}
          status={
            rallying === null
              ? placementStatus(placingOption, onVein)
              : "Set rally point"
          }
        />
        <aside
          aria-label="Strategic status"
          className={styles.strategicHud}
          data-has-training={hasActiveTraining}
        >
          <TrainingTracker
            buildings={model.buildings}
            onSelectBuilding={selectBuilding}
            upgrade={holdUpgradeProgress}
          />
          <StrategicStatus
            model={model}
            onGlossary={() => setGlossaryOpen(true)}
          />
        </aside>
        {coach === null ? null : (
          <div className={styles.coachDock}>
            <CoachMark
              id={coach}
              onDismiss={(id) => {
                setDismissed((current) =>
                  current.includes(id) ? current : [...current, id],
                );
                onDismissCoach?.(id);
              }}
            />
          </div>
        )}
        <ToastList
          onDismiss={(id) =>
            setToasts((current) => current.filter((toast) => toast.id !== id))
          }
          toasts={toasts}
        />
      </div>
      <div className={styles.bottomHud}>
        <UnitPanel
          building={selectedBuilding}
          card={selectionCard}
          groups={unitGroups}
          onCancelTraining={(buildingId, jobId) =>
            onCommand?.({ buildingId, jobId, type: "cancel_training" })
          }
          onClear={clearSelection}
          onGlossary={() => setGlossaryOpen(true)}
          onSelectGroup={(unitIds) => {
            setRallying(null);
            setPlacing(null);
            setInspected(null);
            setSelection({ buildingId: null, unitIds: [...unitIds] });
          }}
          unit={primary}
          upgrade={holdUpgradeProgress}
        />
        <CommandCard
          buttons={cardButtons}
          onActivate={activate}
          stock={stock}
          subject={
            selectionCard.kind === "empty" ? undefined : selectionCard.title
          }
        />
      </div>
      {buildOpen ? (
        <BuildMenu
          onChoose={chooseBuilding}
          onClose={() => setBuildOpen(false)}
          onGlossary={() => setGlossaryOpen(true)}
          options={model.buildOptions}
          stock={stock}
        />
      ) : null}
      {glossaryOpen ? (
        <GlossaryDialog onClose={() => setGlossaryOpen(false)} />
      ) : null}
      {hotkeysOpen ? (
        <HotkeyDialog onClose={() => setHotkeysOpen(false)} />
      ) : null}
      {confirm === null ? null : (
        <CommitDialog
          model={confirm}
          onClose={() => setIntent(null)}
          onCommit={commit}
          onTradeAmount={setTradeAmount}
          tradeAmount={tradeAmount}
        />
      )}
      {loadPhase === "done" ? null : (
        <DescentLoadingScreen
          leaving={loadPhase === "leaving"}
          onSkip={revealBattlefield}
          progress={loadProgress}
        />
      )}
      {model.outcome === null ? null : (
        <section className={styles.outcome} role="dialog">
          <h2>{model.outcome.title}</h2>
          <button onClick={onRestart} type="button">
            Restart
          </button>
        </section>
      )}
    </div>
  );
}
