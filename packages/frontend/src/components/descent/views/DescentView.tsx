/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { footprintCovers, footprintSide } from "../logic/economy/footprint";
import type { SimSpeed } from "../logic/sim/constants";
import { isTrainingBuilding } from "../logic/slice/sliceTraining";
import type { TutorialTargetHint } from "../logic/tutorial";
import type { Command, FormationId, SimSnapshot } from "../logic/types";
import { BuildMenu } from "./BuildMenu";
import { blockedToast } from "./blockers";
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
import {
  addToControlGroup,
  type ControlGroupsState,
  createControlGroupsState,
  recallControlGroup,
  saveControlGroup,
} from "./controlGroups";
import { DescentBabylonViewport } from "./DescentBabylonViewport";
import { DescentLoadingScreen } from "./DescentLoadingScreen";
import styles from "./descentView.module.scss";
import {
  CoachMark,
  CommitDialog,
  GlossaryDialog,
  HotkeyDialog,
  ToastList,
  type ToastTone,
} from "./dialogs";
import type { ControlGroupHotkeyAction, HotkeyAction } from "./hotkeys";
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
import { PlayerScoreboard } from "./PlayerScoreboard";
import type { BuildReadout } from "./presentation";
import {
  type Camera,
  EMPTY_SELECTION,
  idleVillagerIds,
  isLocalPlayerOwned,
  type MapPoint,
  nextIdleVillager,
  nextUnitSelection,
  placementBuilders,
  rallyCommand,
  type Selection,
  selectionGroups,
  snapMapCell,
} from "./selection";
import { buildShellModel, type ShellModel } from "./shellModel";
import {
  growingCrops,
  modelHoldTier,
  ResourceBar,
  StrategicStatus,
  TrainingTracker,
} from "./status";
import { TierUnlockBanner } from "./TierUnlockBanner";
import { TutorialGuide } from "./TutorialGuide";
import type { ResourceSelectionId } from "./text";
import { type HoldUpgradeProgress, UnitPanel } from "./UnitPanel";
import { useAttackAlerts } from "./useAttackAlerts";
import { useHotkeys } from "./useHotkeys";

/** Matches the loading screen's fade-out in `loadingScreen.module.scss`. */
const LOADING_FADE_MS = 520;

/** Opening load: covered, fading out, then gone. */
type LoadPhase = "done" | "leaving" | "loading";

/** Multiplayer HUD metadata shown when playing in a co-op room. */
export interface DescentMultiplayerBar {
  /** Campaign progress rendered inside the existing co-op HUD. */
  campaignProgress?: ReactNode;
  /** Campaign debrief replacing the default outcome dialog, including report waits. */
  campaignDebrief?: ReactNode;
  /** Latest recoverable or terminal multiplayer error. */
  error?: string | null;
  /** Whether the local player joined after the roster was locked. */
  isSpectator?: boolean;
  /** Leaves the active room and returns to the Descent menu. */
  onLeaveRoom: () => void;
  /** Restarts a failed match; shown only when supplied by the host. */
  onRestart?: () => void;
  /** Short joinable room code. */
  roomId: string;
}

/** Props for the Descent desktop shell. */
export interface DescentViewProps {
  /** Whether the page is fullscreen. */
  fullscreen?: boolean;
  /** Local player id in multiplayer matches; omitted in solo play. */
  localPlayerId?: string;
  /** Multiplayer room banner info; omitted in solo play. */
  multiplayer?: DescentMultiplayerBar;
  /** Optional model already derived by the parent for shared audio/rendering. */
  shellModel?: ShellModel;
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
  /** Fired when the player dismisses the tutorial checklist. */
  onDismissTutorial?: () => void;
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
  /** Whether the live co-op tutorial guide overlay is shown. */
  tutorialMode?: boolean;
}

interface Toast {
  id: number;
  message: string;
  tone?: ToastTone;
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
 * Adds notices while keeping only the newest compact stack of each tone, so a
 * burst of game events never pushes out a "why can't I" message.
 * @param current - Notices already visible
 * @param incoming - New notices to append
 * @returns At most `MAX_VISIBLE_TOASTS` newest notices per tone
 */
function appendToasts(current: Toast[], incoming: Toast[]): Toast[] {
  const all = [...current, ...incoming];
  const errors = all.filter((toast) => toast.tone === "error");
  const notices = all.filter((toast) => toast.tone !== "error");
  return [
    ...notices.slice(-MAX_VISIBLE_TOASTS),
    ...errors.slice(-MAX_VISIBLE_TOASTS),
  ];
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
  const repeatHint = "Shift-click to place multiple";
  if (onVein) {
    return `${option.name} · Spirit Vein · ${repeatHint}`;
  }
  return `${option.name} · ${repeatHint}`;
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
  localPlayerId,
  multiplayer,
  onCommand,
  onDismissCoach,
  onDismissTutorial,
  onLoaded,
  onRevive,
  onRestart,
  onSetPaused,
  onSetSpeed,
  onSetSoundEnabled,
  onToggleFullscreen,
  shellModel,
  snapshot,
  soundEnabled = true,
  tutorialMode = false,
}: DescentViewProps) {
  const model = useMemo(
    () => shellModel ?? buildShellModel(snapshot, localPlayerId),
    [localPlayerId, shellModel, snapshot],
  );
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const controlGroups = useRef<ControlGroupsState>(createControlGroupsState());
  const attackPings = useAttackAlerts({ localPlayerId, snapshot });
  const [inspected, setInspected] = useState<InspectTarget | null>(null);
  const [focusRequest, setFocusRequest] = useState<CameraFocusRequest | null>(
    null,
  );
  const focusSequence = useRef(0);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const [buildOpen, setBuildOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const buildWasOpen = useRef(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [formation, setFormation] = useState<FormationId>("ranks");
  const [placing, setPlacing] = useState<string | null>(null);
  const [rallying, setRallying] = useState<string | null>(null);
  const [intent, setIntent] = useState<ConfirmIntent | null>(null);
  const [tradeAmount, setTradeAmount] = useState(1);
  const [cursor, setCursor] = useState<MapPoint | null>(null);
  const cursorRef = useRef<MapPoint | null>(null);
  const placingRef = useRef<string | null>(null);
  placingRef.current = placing;
  const [dismissed, setDismissed] = useState<CoachMarkId[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [minimapHost, setMinimapHost] = useState<HTMLElement | null>(null);
  const [loadProgress, setLoadProgress] = useState<LoadingProgress>(
    EMPTY_LOADING_PROGRESS,
  );
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("loading");
  const villagerWasSelected = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  /** Lifts the loading screen once, whether loading finished or was skipped. */
  const revealBattlefield = useCallback(
    () => setLoadPhase((phase) => (phase === "loading" ? "leaving" : phase)),
    [],
  );

  /** Updates cursor state only when placing a building and crossing grid cells. */
  const handleCursor = useCallback((point: MapPoint | null) => {
    cursorRef.current = point;
    if (placingRef.current === null) {
      setCursor((current) => (current === null ? current : null));
      return;
    }
    if (point === null) {
      setCursor((current) => (current === null ? current : null));
      return;
    }
    const nextCell = snapMapCell(point);
    setCursor((current) => {
      if (current !== null) {
        const prevCell = snapMapCell(current);
        if (prevCell.x === nextCell.x && prevCell.y === nextCell.y) {
          return current;
        }
      }
      return point;
    });
  }, []);

  useEffect(() => {
    if (placing === null) {
      setCursor((current) => (current === null ? current : null));
      return;
    }
    if (cursorRef.current !== null) {
      setCursor(cursorRef.current);
    }
  }, [placing]);

  useEffect(() => {
    if (loadPhase !== "leaving") return;
    onLoadedRef.current?.();
    const timer = setTimeout(() => setLoadPhase("done"), LOADING_FADE_MS);
    return () => clearTimeout(timer);
  }, [loadPhase]);

  const activeSelection = useMemo(() => {
    if (selection.unitIds.length === 0 && selection.buildingId === null) {
      return selection;
    }
    let nextUnitIds = selection.unitIds;
    if (selection.unitIds.length > 0) {
      const liveUnitIds = new Set<string>();
      for (let i = 0; i < model.units.length; i += 1) {
        const unit = model.units[i];
        if (unit !== undefined) liveUnitIds.add(unit.id);
      }
      let allPresent = true;
      for (let i = 0; i < selection.unitIds.length; i += 1) {
        const id = selection.unitIds[i];
        if (id === undefined || !liveUnitIds.has(id)) {
          allPresent = false;
          break;
        }
      }
      if (!allPresent) {
        nextUnitIds = selection.unitIds.filter((id) => liveUnitIds.has(id));
      }
    }
    let nextBuildingId = selection.buildingId;
    if (
      nextBuildingId !== null &&
      !model.buildings.some((building) => building.id === nextBuildingId)
    ) {
      nextBuildingId = null;
    }
    if (
      nextUnitIds === selection.unitIds &&
      nextBuildingId === selection.buildingId
    ) {
      return selection;
    }
    return { buildingId: nextBuildingId, unitIds: nextUnitIds };
  }, [model.buildings, model.units, selection]);

  useEffect(() => {
    if (activeSelection !== selection) setSelection(activeSelection);
  }, [activeSelection, selection]);

  const hasSelectedVillager = useMemo(() => {
    if (activeSelection.unitIds.length === 0) return false;
    const selectedIds = new Set(activeSelection.unitIds);
    return model.units.some(
      (unit) =>
        unit.classId === "villager" &&
        unit.factionId === "hold" &&
        isLocalPlayerOwned(unit, localPlayerId) &&
        selectedIds.has(unit.id),
    );
  }, [activeSelection.unitIds, localPlayerId, model.units]);

  useEffect(() => {
    const lostVillagerSelection =
      villagerWasSelected.current && !hasSelectedVillager;
    villagerWasSelected.current = hasSelectedVillager;
    if (lostVillagerSelection) setBuildOpen(false);
  }, [hasSelectedVillager]);
  useEffect(() => {
    const wasOpen = buildWasOpen.current;
    buildWasOpen.current = buildOpen;
    if (!wasOpen || buildOpen) return;
    const buildButton = shellRef.current?.querySelector(
      '[data-command="build"]',
    );
    if (buildButton instanceof HTMLButtonElement) buildButton.focus();
  }, [buildOpen]);

  const seenNotices = useRef(new Set<string>());
  const noticeKey = useMemo(() => {
    if (model.notices.length === 0) return "";
    return model.notices
      .map((notice) => `${notice.id}:${notice.text}`)
      .join("\n");
  }, [model.notices]);
  useEffect(() => {
    if (noticeKey.length === 0) return;
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
   * Shows why an action failed, centered above the HUD.
   * @param message - Failure text to show
   */
  const pushToast = (message: string) => {
    // A repeated click refreshes the same notice instead of stacking copies.
    setToasts((current) =>
      appendToasts(
        current.filter((toast) => toast.message !== message),
        [{ id: nextToastId(), message, tone: "error" }],
      ),
    );
  };

  /**
   * Explains a blocked command-card action and how to clear it.
   * @param button - The action the player tried
   */
  const explainBlocked = (button: CardButton) => {
    pushToast(blockedToast(button.label, button.blockers ?? []));
  };

  const confirm = useMemo(
    () => (intent === null ? null : buildConfirm(model, intent, tradeAmount)),
    [intent, model, tradeAmount],
  );
  const placingOption = useMemo(
    () =>
      placing === null
        ? null
        : (model.buildOptions.find(
            (option) => option.buildingType === placing,
          ) ?? null),
    [model.buildOptions, placing],
  );
  const placingFootprint = placing === null ? 1 : footprintSide(placing);
  const onVein = useMemo(() => {
    if (placing === null || cursor === null) return false;
    const placementCell = snapMapCell(cursor);
    return model.veins.some((vein) =>
      footprintCovers(
        { buildingType: placing, ...placementCell },
        vein.x,
        vein.y,
      ),
    );
  }, [cursor, model.veins, placing]);
  const primary = useMemo(
    () => primaryUnit(model, activeSelection),
    [activeSelection, model],
  );
  const selectedBuilding = useMemo(
    () =>
      activeSelection.buildingId === null
        ? null
        : (model.buildings.find(
            (building) => building.id === activeSelection.buildingId,
          ) ?? null),
    [activeSelection.buildingId, model.buildings],
  );
  const unitGroups = useMemo(
    () => selectionGroups(model.units, activeSelection.unitIds),
    [activeSelection.unitIds, model.units],
  );
  const inspectTarget = useMemo(
    () => pruneInspectTarget(model, inspected),
    [inspected, model],
  );
  useEffect(() => {
    if (inspectTarget !== inspected) setInspected(inspectTarget);
  }, [inspectTarget, inspected]);
  const selectionCard = useMemo(
    () => describeSelection(model, activeSelection, inspectTarget),
    [activeSelection, inspectTarget, model],
  );
  const cardButtons = useMemo(
    () =>
      buildCardButtons(
        model,
        activeSelection,
        inspectTarget,
        formation,
        localPlayerId,
      ),
    [activeSelection, formation, inspectTarget, localPlayerId, model],
  );
  const selectedResource =
    inspectTarget?.kind === "stockpile" ? inspectTarget.resource : null;
  const rallyBuildingId =
    selectedBuilding !== null &&
    !selectedBuilding.constructing &&
    isLocalPlayerOwned(selectedBuilding, localPlayerId) &&
    isTrainingBuilding(selectedBuilding.buildingType)
      ? selectedBuilding.id
      : null;
  const primaryCultivation = primary?.cultivation ?? null;
  const schoolChoiceVisible =
    primaryCultivation !== null &&
    primaryCultivation.rank === "Sworn" &&
    primaryCultivation.school === undefined;
  const coach = useMemo(
    () =>
      activeCoach({
        dismissed,
        feedOpen: intent?.type === "feed",
        flags: model.onboarding,
        furnaceSelected: selectedBuilding?.buildingType === "alchemy_furnace",
        holdUnitPresent: model.units.some((unit) => unit.factionId === "hold"),
        layerName: model.banner.name,
        schoolChoiceVisible,
      }),
    [
      dismissed,
      intent?.type,
      model.banner.name,
      model.onboarding,
      model.units,
      schoolChoiceVisible,
      selectedBuilding?.buildingType,
    ],
  );
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
   * Requests one camera recenter through the viewport's existing focus path.
   * @param point - Map-space point to center
   */
  const focusOnPoint = (point: MapPoint) => {
    focusSequence.current += 1;
    setFocusRequest({ id: focusSequence.current, point });
  };

  /**
   * Selects the next idle villager and centers the camera on it, cycling
   * through idle villagers on repeated presses.
   */
  const selectIdleVillager = () => {
    const id = nextIdleVillager(
      idleVillagerIds(model.units, localPlayerId),
      activeSelection,
    );
    const villager = model.units.find((unit) => unit.id === id);
    if (id === null || villager === undefined) {
      pushToast("No idle villagers.");
      return;
    }
    setRallying(null);
    setPlacing(null);
    setInspected(null);
    setSelection({ buildingId: null, unitIds: [id] });
    focusOnPoint({ x: villager.x, y: villager.y });
  };

  /**
   * Saves, extends, or recalls one session-local unit control group.
   * Recalled ids are resolved against the latest model before selection, and
   * a double-tap centers on the surviving units' mean map position.
   * @param action - Control-group key action
   */
  const handleControlGroup = (action: ControlGroupHotkeyAction) => {
    if (action.mode === "save") {
      controlGroups.current = saveControlGroup(
        controlGroups.current,
        action.slot,
        activeSelection.unitIds,
      );
      return;
    }
    if (action.mode === "add") {
      controlGroups.current = addToControlGroup(
        controlGroups.current,
        action.slot,
        activeSelection.unitIds,
      );
      return;
    }
    const recalled = recallControlGroup(
      controlGroups.current,
      action.slot,
      Date.now(),
    );
    controlGroups.current = recalled.state;
    if (recalled.selectionIds === null) return;
    const unitsById = new Map(model.units.map((unit) => [unit.id, unit]));
    const units = recalled.selectionIds.flatMap((id) => {
      const unit = unitsById.get(id);
      if (
        unit === undefined ||
        unit.factionId !== "hold" ||
        !isLocalPlayerOwned(unit, localPlayerId)
      ) {
        return [];
      }
      return [unit];
    });
    setRallying(null);
    setPlacing(null);
    setInspected(null);
    setSelection({
      buildingId: null,
      unitIds: units.map((unit) => unit.id),
    });
    if (!recalled.center || units.length === 0) return;
    const center = units.reduce(
      (sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }),
      { x: 0, y: 0 },
    );
    focusOnPoint({
      x: center.x / units.length,
      y: center.y / units.length,
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
    if (button.disabled === true) {
      explainBlocked(button);
      return;
    }
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
      const idle = idleVillagerIds(model.units, localPlayerId);
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
    if (next.type === "qi_art") {
      onCommand?.({ type: "cast_qi_art", unitIds: next.unitIds });
      return;
    }
    if (next.type === "meditate") {
      onCommand?.({ type: "toggle_meditate", unitIds: next.unitIds });
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
    if (action.type === "controlGroup") {
      handleControlGroup(action);
      return;
    }
    if (action.type === "build") {
      setBuildOpen((open) => !open);
      return;
    }
    if (action.type === "qi_art") {
      const qiTile = cardButtons.find((button) => button.id === "qi-art");
      if (qiTile?.disabled === true) {
        explainBlocked(qiTile);
        return;
      }
      const unitsById = new Map(model.units.map((unit) => [unit.id, unit]));
      const unitIds = activeSelection.unitIds.filter((id) => {
        const match = unitsById.get(id);
        return (
          match !== undefined &&
          match.factionId === "hold" &&
          match.qiArt !== null
        );
      });
      if (unitIds.length > 0) {
        onCommand?.({ type: "cast_qi_art", unitIds });
      }
      return;
    }
    if (action.type === "meditate") {
      const unitsById = new Map(model.units.map((unit) => [unit.id, unit]));
      const unitIds = activeSelection.unitIds.filter((id) => {
        const match = unitsById.get(id);
        return (
          match !== undefined &&
          match.factionId === "hold" &&
          match.qiArt !== null
        );
      });
      if (unitIds.length > 0) {
        onCommand?.({ type: "toggle_meditate", unitIds });
      }
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
      const camp =
        model.buildings.find(
          (item) =>
            item.buildingType === "camp" &&
            item.factionId === "hold" &&
            isLocalPlayerOwned(item, localPlayerId),
        ) ??
        model.buildings.find(
          (item) => item.buildingType === "camp" && item.factionId === "hold",
        );
      if (camp !== undefined) {
        setInspected(null);
        setSelection({ buildingId: camp.id, unitIds: [] });
        focusOnPoint({ x: camp.x, y: camp.y });
      }
      return;
    }
    const option = model.trainOptions.find(
      (item) => item.buildingId === activeSelection.buildingId,
    );
    if (option === undefined) {
      pushToast("Select the Camp or a Barracks to train.");
      return;
    }
    if (!option.allowed) {
      const tile = cardButtons.find(
        (button) => button.id === `train-${option.classId}`,
      );
      if (tile !== undefined) {
        explainBlocked(tile);
        return;
      }
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
   * Focuses or selects the entity or menu for the active tutorial step.
   * @param hint - Target hint from the active tutorial step
   */
  const focusTutorialTarget = (hint: TutorialTargetHint) => {
    const owned = (ownerId?: string) =>
      localPlayerId === undefined ||
      ownerId === undefined ||
      ownerId === localPlayerId;
    if (hint === "idle_villagers") {
      selectIdleVillager();
      return;
    }
    if (hint === "build_barracks") {
      setBuildOpen(true);
      return;
    }
    if (hint === "barracks" || hint === "camp") {
      const building = model.buildings.find(
        (entry) =>
          entry.factionId === "hold" &&
          entry.buildingType === hint &&
          owned(entry.ownerId),
      );
      if (building === undefined) {
        pushToast(
          hint === "barracks" ? "Build a Barracks first." : "No Camp found.",
        );
        return;
      }
      selectBuilding(building.id);
      focusOnPoint({ x: building.x, y: building.y });
      return;
    }
    if (hint === "soldiers") {
      const soldiers = model.units.filter(
        (unit) =>
          unit.factionId === "hold" &&
          unit.classId !== "villager" &&
          owned(unit.ownerId),
      );
      if (soldiers.length === 0) {
        pushToast("No soldiers available.");
        return;
      }
      setRallying(null);
      setPlacing(null);
      setInspected(null);
      setSelection({
        buildingId: null,
        unitIds: soldiers.map((unit) => unit.id),
      });
      const lead = soldiers[0];
      if (lead !== undefined) focusOnPoint({ x: lead.x, y: lead.y });
      return;
    }
    if (hint === "cultivator") {
      const candidate =
        model.units.find(
          (unit) =>
            unit.factionId === "hold" &&
            unit.breakthroughReady &&
            owned(unit.ownerId),
        ) ??
        model.units.find(
          (unit) =>
            unit.factionId === "hold" &&
            unit.classId !== "villager" &&
            owned(unit.ownerId),
        );
      if (candidate === undefined) {
        pushToast("No cultivator ready.");
        return;
      }
      setRallying(null);
      setPlacing(null);
      setInspected(null);
      setSelection({ buildingId: null, unitIds: [candidate.id] });
      focusOnPoint({ x: candidate.x, y: candidate.y });
      return;
    }
    if (hint === "boss") {
      const boss = model.units.find((unit) => unit.boss);
      if (boss !== undefined) {
        focusOnPoint({ x: boss.x, y: boss.y });
        return;
      }
      focusOnPoint({ x: model.map.width - 2, y: model.map.height / 2 });
    }
  };

  /**
   * @param option - Building the player chose from the menu
   */
  const chooseBuilding = (option: BuildReadout) => {
    if (!option.unlocked) {
      pushToast(option.lockedReason ?? `Requires ${option.tier}`);
      return;
    }
    if (option.affordable === false) {
      pushToast(option.lockedReason ?? "Not enough resources");
      return;
    }
    setPlacing(option.buildingType);
    setRallying(null);
    setBuildOpen(false);
  };

  const stock = useMemo(() => costStock(model), [model]);
  const holdUpgradeProgress = useMemo(() => runningHoldUpgrade(model), [model]);
  const holdTier = useMemo(
    () => modelHoldTier(model, localPlayerId),
    [localPlayerId, model],
  );
  const hasActiveTraining = useMemo(
    () =>
      holdUpgradeProgress !== null ||
      model.buildings.some((building) => building.trainingQueue.length > 0) ||
      growingCrops(model.buildings).length > 0,
    [holdUpgradeProgress, model.buildings],
  );

  return (
    <div
      className={styles.shell}
      data-has-training={hasActiveTraining}
      data-paused={model.paused}
      data-testid="descent-view"
      ref={shellRef}
    >
      <h1 className={styles.srOnly}>Descent</h1>
      <div className={styles.topHud} data-testid="descent-top-hud">
        <ResourceBar
          fullscreen={fullscreen}
          localPlayerId={localPlayerId}
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
        <div className={styles.coopHud} data-testid="descent-coop-hud">
          {multiplayer !== undefined || model.players.length > 0 ? (
            <div className={styles.coopBar} data-testid="descent-coop-bar">
              {multiplayer === undefined ? null : (
                <span className={styles.coopRoomBadge}>
                  Room <strong>{multiplayer.roomId}</strong>
                  {tutorialMode ? " · Tutorial" : ""}
                </span>
              )}
              {multiplayer?.isSpectator === true ? (
                <span className={styles.coopSpectatorBadge}>Spectator</span>
              ) : null}
              {multiplayer?.onRestart === undefined ? null : (
                <button
                  className={styles.coopLeaveButton}
                  onClick={multiplayer.onRestart}
                  type="button"
                >
                  Restart
                </button>
              )}
              {multiplayer === undefined ? null : (
                <button
                  className={styles.coopLeaveButton}
                  onClick={multiplayer.onLeaveRoom}
                  type="button"
                >
                  Leave
                </button>
              )}
              {multiplayer?.error == null ? null : (
                <span className={styles.coopError} role="alert">
                  {multiplayer.error}
                </span>
              )}
            </div>
          ) : null}
          {multiplayer?.campaignProgress}
          <PlayerScoreboard
            localPlayerId={localPlayerId}
            players={model.players}
          />
        </div>
        {tutorialMode ? (
          <TutorialGuide
            onDismiss={onDismissTutorial}
            onFocusTarget={focusTutorialTarget}
            snapshot={snapshot}
            waveHeld={model.wave?.waveHeld === true}
          />
        ) : null}
        <TierUnlockBanner holdTier={holdTier} />
        <DescentBabylonViewport
          camera={camera}
          focusRequest={focusRequest}
          inspected={inspectTarget}
          localPlayerId={localPlayerId}
          minimapHost={minimapHost}
          model={model}
          onCameraChange={setCamera}
          onCommand={(command) =>
            onCommand?.(applyFormation(command, formation))
          }
          onCursor={handleCursor}
          onInspect={inspect}
          onLoaded={revealBattlefield}
          onLoadProgress={setLoadProgress}
          onPlace={(point, queue = false) => {
            if (placing === null) return;
            const cell = snapMapCell(point);
            onCommand?.({
              builderIds: placementBuilders(
                model.units,
                activeSelection,
                localPlayerId,
              ),
              buildingType: placing,
              type: "place_building",
              ...(queue ? { queue: true } : {}),
              x: cell.x,
              y: cell.y,
            });
            if (!queue) setPlacing(null);
          }}
          onPlaceLine={(cells, keepPlacing) => {
            if (placing === null) return;
            const builderIds = placementBuilders(
              model.units,
              activeSelection,
              localPlayerId,
            );
            // Every piece is queued so builders sweep the whole line.
            for (const cell of cells) {
              onCommand?.({
                builderIds,
                buildingType: placing,
                queue: true,
                type: "place_building",
                x: cell.x,
                y: cell.y,
              });
            }
            if (!keepPlacing) setPlacing(null);
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
          pings={attackPings}
          placing={placing !== null}
          placingFootprint={placingFootprint}
          placingType={placing}
          rallyBuildingId={rallyBuildingId}
          selection={activeSelection}
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
            localPlayerId={localPlayerId}
            onSelectBuilding={selectBuilding}
            upgrade={holdUpgradeProgress}
          />
          <StrategicStatus
            model={model}
            onCallWaveEarly={() => onCommand?.({ type: "call_next_wave" })}
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
      <div className={styles.bottomHud} data-testid="descent-bottom-hud">
        {buildOpen ? (
          <BuildMenu
            onChoose={chooseBuilding}
            onClose={() => setBuildOpen(false)}
            onGlossary={() => setGlossaryOpen(true)}
            options={model.buildOptions}
            shortcutsSuspended={
              glossaryOpen ||
              hotkeysOpen ||
              intent !== null ||
              model.outcome !== null ||
              multiplayer?.campaignDebrief != null
            }
            stock={stock}
          />
        ) : (
          <CommandCard
            buttons={cardButtons}
            onActivate={activate}
            onBlocked={explainBlocked}
            stock={stock}
            subject={
              selectionCard.kind === "empty" ? undefined : selectionCard.title
            }
          />
        )}
        <UnitPanel
          building={selectedBuilding}
          card={selectionCard}
          groups={unitGroups}
          localPlayerId={localPlayerId}
          onCancelTraining={(buildingId, jobId) =>
            onCommand?.({ buildingId, jobId, type: "cancel_training" })
          }
          onClear={clearSelection}
          onSelectGroup={(unitIds) => {
            setRallying(null);
            setPlacing(null);
            setInspected(null);
            setSelection({ buildingId: null, unitIds: [...unitIds] });
          }}
          unit={primary}
          upgrade={holdUpgradeProgress}
        />
        <section
          aria-label="Minimap"
          className={styles.minimapWell}
          ref={setMinimapHost}
        />
      </div>
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
      {multiplayer?.campaignDebrief != null || model.outcome !== null ? (
        <section
          aria-label={
            multiplayer?.campaignDebrief != null
              ? "Campaign debrief"
              : "Match outcome"
          }
          className={styles.outcome}
          role="dialog"
        >
          {multiplayer?.campaignDebrief ?? (
            <>
              <h2>{model.outcome?.title}</h2>
              {onRestart === undefined ? null : (
                <button onClick={onRestart} type="button">
                  Restart
                </button>
              )}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
