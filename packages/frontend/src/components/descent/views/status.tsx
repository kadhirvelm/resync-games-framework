/** @jsxRuntime automatic */
/** @jsxImportSource react */

import {
  Gauge,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { HoldTier } from "../logic/economy/model";
import {
  SIM_SPEEDS,
  type SimSpeed,
  ticksToSeconds,
} from "../logic/sim/constants";
import type { ResourceId } from "../logic/types";
import styles from "./descentView.module.scss";
import { idleVillagerIds, isLocalPlayerOwned } from "./selection";
import type { ShellBuilding, ShellModel } from "./shellModel";
import {
  CLASS_LABEL,
  CLASS_ORDER,
  formatEta,
  POPULATION_COPY,
  pressurePercent,
  RESOURCE_COPY,
  type ResourceCopy,
  type ResourceSelectionId,
} from "./text";
import type { HoldUpgradeProgress } from "./UnitPanel";
import { visibleResourceIds } from "./visibleResources";

const VALID_HOLD_TIERS: ReadonlySet<string> = new Set<HoldTier>([
  "Camp",
  "Outpost",
  "Stronghold",
  "Citadel",
]);

/**
 * Type guard for published Hold tier strings.
 * @param value - Candidate tier string
 * @returns Whether the value is a known HoldTier
 */
function isHoldTier(value: string | null | undefined): value is HoldTier {
  return value !== null && value !== undefined && VALID_HOLD_TIERS.has(value);
}

/**
 * Reads the local Hold's current tier from the shell model, falling back to Camp.
 * @param model - Shell model
 * @param localPlayerId - Local co-op owner, or undefined in solo play
 * @returns Current Hold tier
 */
export function modelHoldTier(
  model: ShellModel,
  localPlayerId?: string,
): HoldTier {
  if (isHoldTier(model.holdTier)) return model.holdTier;
  if (isHoldTier(model.holdUpgrade?.currentTier)) {
    return model.holdUpgrade.currentTier;
  }
  const camp = model.buildings.find(
    (building) =>
      building.buildingType === "camp" &&
      building.factionId === "hold" &&
      isLocalPlayerOwned(building, localPlayerId),
  );
  if (isHoldTier(camp?.tier)) return camp.tier;
  return "Camp";
}

/**
 * Formats a simulation tick count as an elapsed `MM:SS` clock string.
 * @param tick - Elapsed sim ticks
 * @returns Elapsed time string
 */
export function formatSimClock(tick: number): string {
  const totalSeconds = Math.max(0, Math.floor(ticksToSeconds(tick)));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Progressively revealed resources, population, idle villager alert, Hold tier,
 * elapsed clock, pause, and speed.
 * @param props - Model, optional progression overrides, and sim clock callbacks
 * @returns The resource bar
 */
export const ResourceBar = memo(function ResourceBar({
  discoveredResourceIds,
  fullscreen = false,
  holdTier,
  localPlayerId,
  model,
  onSelectIdleVillager,
  onSelectResource,
  onSetPaused,
  onSetSpeed,
  onSetSoundEnabled,
  onToggleFullscreen,
  selectedResource = null,
  soundEnabled = true,
}: {
  /** Explored deposit resources; defaults to resources visible in `model.nodes`. */
  discoveredResourceIds?: ReadonlySet<ResourceId>;
  /** Whether the page is fullscreen. */
  fullscreen?: boolean;
  /** Current Hold tier override; defaults to the tier inferred from `model`. */
  holdTier?: HoldTier;
  /** Local co-op owner used for the Camp fallback at Citadel. */
  localPlayerId?: string;
  model: ShellModel;
  /** Cycles to the next idle villager and centers the camera. */
  onSelectIdleVillager?: () => void;
  onSelectResource?: (resource: ResourceSelectionId) => void;
  onSetPaused?: (paused: boolean) => void;
  onSetSpeed?: (speed: SimSpeed) => void;
  onSetSoundEnabled?: (enabled: boolean) => void;
  /** Enters or leaves fullscreen; the button hides without it. */
  onToggleFullscreen?: () => void;
  selectedResource?: ResourceSelectionId | null;
  soundEnabled?: boolean;
}) {
  const pop = model.pop === null ? "—" : `${model.pop.used}/${model.pop.cap}`;
  const resolvedTier = holdTier ?? modelHoldTier(model, localPlayerId);
  const idleCount = useMemo(
    () => idleVillagerIds(model.units, localPlayerId).length,
    [localPlayerId, model.units],
  );
  const elapsedClock = formatSimClock(model.tick);
  const resolvedDiscovered = useMemo(() => {
    if (discoveredResourceIds !== undefined) return discoveredResourceIds;
    return new Set(model.nodes.map((node) => node.resource));
  }, [discoveredResourceIds, model.nodes]);
  const visibleIds = visibleResourceIds({
    discoveredResourceIds: resolvedDiscovered,
    holdTier: resolvedTier,
    resources: model.resources,
  });
  return (
    <div className={styles.resources}>
      <div className={styles.resourceLedger}>
        {visibleIds.map((resourceId) => {
          const copy = RESOURCE_COPY[resourceId];
          return (
            <ResourceChip
              amount={model.resources[resourceId]}
              copy={copy}
              iconSrc={`/descent/resource-icons/${resourceId}.png`}
              key={resourceId}
              onSelect={onSelectResource}
              resourceId={resourceId}
              selected={selectedResource === resourceId}
            />
          );
        })}
        <ResourceChip
          amount={pop}
          copy={POPULATION_COPY}
          iconSrc="/descent/resource-icons/population.png"
          onSelect={onSelectResource}
          resourceId="population"
          selected={selectedResource === "population"}
          testId="pop"
        />
        {idleCount > 0 && onSelectIdleVillager !== undefined ? (
          <button
            aria-keyshortcuts="."
            aria-label={`Select idle villager (${idleCount} idle)`}
            className={styles.idleVillagerButton}
            data-testid="idle-villager-button"
            onClick={onSelectIdleVillager}
            title={`Cycle idle villager (.) · ${idleCount} idle`}
            type="button"
          >
            {/* biome-ignore lint/performance/noImgElement: bundled game HUD icon */}
            <img
              alt=""
              aria-hidden="true"
              className={styles.idleVillagerIcon}
              height="18"
              src="/descent/command-icons/idle.png"
              width="18"
            />
            <span className={styles.idleVillagerCount}>{idleCount}</span>
            <kbd className={styles.idleVillagerKey}>.</kbd>
          </button>
        ) : null}
      </div>
      <div className={styles.topBarRight}>
        <div className={styles.topBarMeta}>
          <span
            className={styles.holdTierBadge}
            data-testid="hold-tier-badge"
            title={`Hold Tier: ${resolvedTier}`}
          >
            {resolvedTier}
          </span>
          <time
            className={styles.simClock}
            data-testid="sim-clock"
            title={`Elapsed time ${elapsedClock}`}
          >
            {elapsedClock}
          </time>
        </div>
        <fieldset className={styles.clockControls}>
          <legend className={styles.srOnly}>Game controls</legend>
          {onToggleFullscreen === undefined ? null : (
            <button
              aria-keyshortcuts="F"
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              aria-pressed={fullscreen}
              className={styles.controlButton}
              data-testid="descent-fullscreen"
              onClick={onToggleFullscreen}
              title={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
              type="button"
            >
              {fullscreen ? (
                <Minimize aria-hidden="true" size={17} strokeWidth={2} />
              ) : (
                <Maximize aria-hidden="true" size={17} strokeWidth={2} />
              )}
              <span className={styles.srOnly}>
                {fullscreen ? "Windowed" : "Fullscreen"}
              </span>
            </button>
          )}
          <button
            aria-label={soundEnabled ? "Mute sound" : "Enable sound"}
            aria-pressed={!soundEnabled}
            className={styles.controlButton}
            data-muted={!soundEnabled}
            data-testid="descent-sound"
            onClick={() => onSetSoundEnabled?.(!soundEnabled)}
            title={soundEnabled ? "Mute sound" : "Enable sound"}
            type="button"
          >
            {soundEnabled ? (
              <Volume2 aria-hidden="true" size={17} strokeWidth={2} />
            ) : (
              <VolumeX aria-hidden="true" size={17} strokeWidth={2} />
            )}
            <span className={styles.srOnly}>Sound</span>
          </button>
          <button
            aria-label={model.paused ? "Resume simulation" : "Pause simulation"}
            aria-pressed={model.paused}
            className={`${styles.controlButton} ${styles.pauseButton}`}
            data-testid="descent-pause"
            onClick={() => onSetPaused?.(!model.paused)}
            title={model.paused ? "Resume (Space)" : "Pause (Space)"}
            type="button"
          >
            {model.paused ? (
              <Play aria-hidden="true" size={17} strokeWidth={2.2} />
            ) : (
              <Pause aria-hidden="true" size={17} strokeWidth={2.2} />
            )}
            <span className={styles.srOnly}>
              {model.paused ? "Resume" : "Pause"}
            </span>
          </button>
          <span aria-hidden="true" className={styles.controlDivider} />
          <fieldset className={styles.speedGroup}>
            <legend className={styles.srOnly}>Game speed</legend>
            <Gauge
              aria-hidden="true"
              className={styles.speedIcon}
              size={15}
              strokeWidth={2}
            />
            {SIM_SPEEDS.map((speed) => (
              <button
                aria-label={`Set speed to ${speed}×`}
                aria-pressed={model.speed === speed}
                className={styles.speed}
                key={speed}
                onClick={() => onSetSpeed?.(speed)}
                title={`${speed}× speed`}
                type="button"
              >
                {speed}×
              </button>
            ))}
          </fieldset>
        </fieldset>
      </div>
    </div>
  );
});

/**
 * One stockpile chip. Hover or focus shows what it is, what it buys, and
 * how to get more.
 * @param props - Amount, icon, and the three short lines
 * @returns The chip and its tooltip
 */
function ResourceChip({
  amount,
  copy,
  iconSrc,
  onSelect,
  resourceId,
  selected,
  testId,
}: {
  amount: number | string;
  copy: ResourceCopy;
  iconSrc: string;
  onSelect?: (resource: ResourceSelectionId) => void;
  resourceId: ResourceSelectionId;
  selected: boolean;
  testId?: string;
}) {
  return (
    <button
      aria-label={resourceTipLabel(copy)}
      aria-pressed={selected}
      className={styles.resource}
      data-resource-chip={resourceId}
      data-testid={testId}
      onClick={() => onSelect?.(resourceId)}
      type="button"
    >
      <span aria-hidden="true" className={styles.resourceMark}>
        {/* biome-ignore lint/performance/noImgElement: bundled game HUD icon */}
        <img
          alt=""
          className={styles.resourceIcon}
          height="28"
          src={iconSrc}
          width="28"
        />
      </span>
      <span className={styles.resourceAmount} data-resource={resourceId}>
        {amount}
      </span>
      <span aria-hidden="true" className={styles.resourceTip} role="tooltip">
        <strong className={styles.resourceTipName}>
          {copy.name}
          {copy.slang !== undefined && (
            <span className={styles.resourceTipSlang}>{copy.slang}</span>
          )}
        </strong>
        <span className={styles.resourceTipUse}>{copy.use}</span>
        <span className={styles.resourceTipMore}>{copy.more}</span>
      </span>
    </button>
  );
}

/**
 * @param copy - Tooltip lines for one chip
 * @returns The name, use, and gather hint as one spoken label
 */
function resourceTipLabel(copy: ResourceCopy): string {
  const slang = copy.slang === undefined ? "" : ` (${copy.slang})`;
  return `${copy.name}${slang}. ${copy.use} ${copy.more}`;
}

/**
 * The tracker entry for a running Hold upgrade.
 * @param props - The upgrade and a callback that selects the Camp
 * @returns One tracker button
 */
function UpgradeTrackerItem({
  onSelect,
  upgrade,
}: {
  onSelect?: () => void;
  upgrade: HoldUpgradeProgress;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, upgrade.progress)) * 100);
  return (
    <button
      aria-label={`Select Camp, upgrading to ${upgrade.targetTier} ${percent}% complete`}
      className={styles.trainingTrackerItem}
      data-hold-upgrade="true"
      disabled={onSelect === undefined}
      onClick={onSelect}
      type="button"
    >
      <span className={styles.trainingTrackerCopy}>
        <strong>{upgrade.targetTier}</strong>
        <span>Hold upgrade</span>
      </span>
      <span className={styles.trainingTrackerPercent}>{percent}%</span>
      <meter
        aria-label={`${upgrade.targetTier} upgrade progress`}
        className={styles.trainingTrackerProgress}
        max={1}
        min={0}
        value={upgrade.progress}
      />
      <span className={styles.trainingTrackerQueue}>
        {upgrade.secondsLeft}s left
      </span>
    </button>
  );
}

/**
 * The tracker entry for a harvested producer's growing or ripe crop.
 * @param props - The producer and a callback that selects it
 * @returns One tracker button
 */
function CropTrackerItem({
  building,
  onSelect,
}: {
  building: ShellBuilding;
  onSelect: () => void;
}) {
  const growth = building.growth;
  if (growth === null) return null;
  const percent = Math.floor(Math.min(1, Math.max(0, growth.progress)) * 100);
  const state = growth.ripe ? "Ripe; harvest it" : "Growing";
  return (
    <button
      aria-label={`Select ${building.name}, crop ${percent}% grown${growth.ripe ? ", ready to harvest" : ""}`}
      className={styles.trainingTrackerItem}
      data-crop-building={building.id}
      data-ripe={growth.ripe}
      onClick={onSelect}
      type="button"
    >
      <span className={styles.trainingTrackerCopy}>
        <strong>Spirit Herbs</strong>
        <span>{building.name}</span>
      </span>
      <span className={styles.trainingTrackerPercent}>{percent}%</span>
      <meter
        aria-label={`${building.name} growth`}
        className={styles.trainingTrackerProgress}
        max={1}
        min={0}
        value={growth.progress}
      />
      <span className={styles.trainingTrackerQueue}>{state}</span>
    </button>
  );
}

/**
 * @param buildings - Buildings in the shell model
 * @returns Hold producers with a crop in the ground or waiting to be harvested
 */
export function growingCrops(
  buildings: readonly ShellBuilding[],
): ShellBuilding[] {
  return buildings.filter(
    (building) =>
      building.factionId === "hold" &&
      building.growth !== null &&
      (building.growth.progress > 0 || building.growth.ripe),
  );
}

/**
 * Names the main Hold by its current tier while leaving specialist buildings
 * on their familiar names.
 * @param building - Training building to name
 * @returns Player-facing building label
 */
function trainingBuildingName(building: ShellBuilding): string {
  if (building.buildingType !== "camp") return building.name;
  return building.tier ?? building.name;
}

/**
 * Persistent overview of every live training batch, a running Hold upgrade,
 * and each growing Spirit Herb crop. Selecting an entry jumps the contextual
 * panel to that building.
 * @param props - Buildings, the running upgrade, and selection callback
 * @returns The tracker, or nothing when nothing is training, upgrading, or growing
 */
export const TrainingTracker = memo(function TrainingTracker({
  buildings,
  localPlayerId,
  onSelectBuilding,
  upgrade = null,
}: {
  buildings: readonly ShellBuilding[];
  /** Local co-op owner whose Camp is upgrading; omitted in solo play. */
  localPlayerId?: string;
  onSelectBuilding: (id: string) => void;
  /** A paid-for Hold upgrade that is under way. */
  upgrade?: HoldUpgradeProgress | null;
}) {
  const active = buildings.filter(
    (building) => building.trainingQueue.length > 0,
  );
  const camp = buildings.find(
    (building) =>
      building.buildingType === "camp" &&
      building.factionId === "hold" &&
      isLocalPlayerOwned(building, localPlayerId),
  );
  const crops = growingCrops(buildings);
  const trainingCount = active.length + (upgrade === null ? 0 : 1);
  const activeCount = trainingCount + crops.length;
  if (activeCount === 0) return null;

  return (
    <section aria-label="Active training" className={styles.trainingTracker}>
      <header className={styles.trainingTrackerHeader}>
        <span aria-hidden="true" className={styles.trainingTrackerPulse} />
        <strong>{trainingCount > 0 ? "Training" : "Gardens"}</strong>
        <span>{activeCount} active</span>
      </header>
      <div className={styles.trainingTrackerList}>
        {upgrade === null ? null : (
          <UpgradeTrackerItem
            onSelect={
              camp === undefined ? undefined : () => onSelectBuilding(camp.id)
            }
            upgrade={upgrade}
          />
        )}
        {active.map((building) => {
          const current = building.trainingQueue[0];
          if (current === undefined) return null;
          const percent = Math.round(
            Math.min(1, Math.max(0, current.progress)) * 100,
          );
          const waiting = building.trainingQueue.length - 1;
          const queueLabel = waiting === 0 ? "Now" : `+${waiting} queued`;
          const buildingName = trainingBuildingName(building);
          return (
            <button
              aria-label={`Select ${buildingName}, ${current.label} training ${percent}% complete`}
              className={styles.trainingTrackerItem}
              data-training-building={building.id}
              key={building.id}
              onClick={() => onSelectBuilding(building.id)}
              type="button"
            >
              <span className={styles.trainingTrackerCopy}>
                <strong>
                  {current.count > 1
                    ? `${current.label} ×${current.count}`
                    : current.label}
                </strong>
                <span>{buildingName}</span>
              </span>
              <span className={styles.trainingTrackerPercent}>{percent}%</span>
              <meter
                aria-label={`${current.label} training progress`}
                className={styles.trainingTrackerProgress}
                max={1}
                min={0}
                value={current.progress}
              />
              <span className={styles.trainingTrackerQueue}>{queueLabel}</span>
            </button>
          );
        })}
        {crops.map((building) => (
          <CropTrackerItem
            building={building}
            key={building.id}
            onSelect={() => onSelectBuilding(building.id)}
          />
        ))}
      </div>
    </section>
  );
});

/**
 * Reads a countdown from either the live wave summary or an older Omen-only preview.
 * @param model - Shell model with published wave data
 * @returns Seconds remaining, or null when no upcoming wave is known
 */
function publishedWaveEta(model: ShellModel): number | null {
  if (model.wave !== null) return model.wave.etaSeconds;
  return model.omen?.etaSeconds ?? null;
}

/**
 * Spoken name for the collapsed pressure chip, including the wave countdown
 * when one is published.
 * @param model - Shell model
 * @param percent - Whole-number Hell Pressure
 * @returns The chip's accessible name
 */
function collapsedThreatLabel(model: ShellModel, percent: number): string {
  const wave = model.wave;
  const etaSeconds = publishedWaveEta(model);
  if (etaSeconds === null) {
    if (wave !== null) {
      return `Hell Pressure ${percent}%. ${wave.label} has spawned. Show wave details.`;
    }
    return `Hell Pressure ${percent}%. No scheduled wave. Show pressure and wave details.`;
  }
  const eta = formatEta(etaSeconds, model.paused);
  const label = wave?.label ?? "Next wave";
  return `Hell Pressure ${percent}%. ${label} in ${eta}. Show pressure and wave details.`;
}

/**
 * Small chevron for the threat cluster's expand and collapse controls.
 * @param props - Which way the chevron points
 * @returns A decorative 12px icon
 */
function Chevron({ direction }: { direction: "down" | "up" }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.chevron}
      fill="none"
      height="12"
      viewBox="0 0 12 12"
      width="12"
    >
      <path
        d={direction === "up" ? "M2.5 7.5 6 4l3.5 3.5" : "M2.5 4.5 6 8l3.5-3.5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * Pressure meter and Omen preview. Collapsed, a chip keeps the pressure
 * percent and the next wave's countdown on screen.
 * @param props - Model and glossary opener
 * @returns The collapsed chip, or the expanded pressure and omen panels
 */
export const StrategicStatus = memo(function StrategicStatus({
  model,
  onCallWaveEarly,
  onGlossary,
}: {
  model: ShellModel;
  /** Calls the next wave immediately for an early-call resource bonus. */
  onCallWaveEarly?: () => void;
  onGlossary: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const percent = pressurePercent(model.hellPressure);
  const waveHeld = model.wave?.waveHeld === true;
  const canCallEarly =
    model.wave?.canCallEarly === true && onCallWaveEarly !== undefined;
  const bonusLabel = model.wave?.earlyCallBonusLabel;
  const etaSeconds = publishedWaveEta(model);
  const callEarlyTitle =
    bonusLabel === undefined
      ? "Call the next wave early for bonus supplies"
      : `Call the next wave early (${bonusLabel})`;

  if (!expanded) {
    return (
      <div className={styles.threatRow}>
        <button
          aria-expanded={false}
          aria-label={collapsedThreatLabel(model, percent)}
          className={styles.threatChip}
          data-testid="threat-chip"
          onClick={() => setExpanded(true)}
          title="Show pressure and omen"
          type="button"
        >
          <span className={styles.threatChipLabel}>Pressure</span>
          <strong data-testid="threat-chip-percent">{`${percent}%`}</strong>
          {etaSeconds === null ? null : (
            <>
              <span aria-hidden="true" className={styles.threatChipDivider} />
              <span className={styles.threatChipLabel}>Wave</span>
              <span className={styles.threatChipEta}>
                {waveHeld ? "Held" : formatEta(etaSeconds, model.paused)}
              </span>
            </>
          )}
          <Chevron direction="down" />
        </button>
        {canCallEarly ? (
          <button
            aria-label={callEarlyTitle}
            className={styles.callWaveButton}
            data-testid="call-wave-early"
            onClick={onCallWaveEarly}
            title={callEarlyTitle}
            type="button"
          >
            Call Wave
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.threatCluster}>
      <HellPressure model={model} />
      <OmenPanel
        model={model}
        onCallWaveEarly={onCallWaveEarly}
        onCollapse={() => setExpanded(false)}
        onGlossary={onGlossary}
      />
    </div>
  );
});

/**
 * Hell Pressure meter. The value is the snapshot's published ratio.
 * @param props - Shell model
 * @returns The meter
 */
export function HellPressure({ model }: { model: ShellModel }) {
  const percent = pressurePercent(model.hellPressure);
  return (
    <section aria-label="Hell Pressure" className={styles.threatPanel}>
      <div className={styles.threatHeading}>
        <span>Pressure</span>
        <strong>{percent}%</strong>
      </div>
      <meter className={styles.meter} max={100} min={0} value={percent}>
        {percent}%
      </meter>
      <p className={styles.pressureHint}>
        Pressure strengthens the horde. Gathered Essence strengthens new waves.
      </p>
    </section>
  );
}

/**
 * Renders a live wave summary and/or an older Omen-only composition.
 * @param props - Shell model with wave and Omen readouts
 * @returns Forecast details, or an empty-state message
 */
function WaveDetails({ model }: { model: ShellModel }) {
  if (model.wave === null && model.omen === null) {
    return <p className={styles.omenEmpty}>No scheduled wave</p>;
  }
  return (
    <>
      {model.wave === null ? null : <WaveSummary model={model} />}
      <OmenComposition model={model} />
    </>
  );
}

/**
 * Shows the scheduled wave's public label and current stat explanation.
 * @param props - Shell model whose wave summary is present
 * @returns Wave label and optional power breakdown
 */
function WaveSummary({ model }: { model: ShellModel }) {
  const wave = model.wave;
  if (wave === null) return null;
  return (
    <>
      <p className={styles.waveName}>
        Wave {wave.index}/{wave.total}: <strong>{wave.label}</strong>
      </p>
      {wave.powerLabel === undefined ? null : (
        <p className={styles.wavePower}>{wave.powerLabel}</p>
      )}
    </>
  );
}

/**
 * Shows an Omen composition, or explains how to reveal one.
 * @param props - Shell model with an optional Omen preview
 * @returns Class counts or the Omen Tower hint
 */
function OmenComposition({ model }: { model: ShellModel }) {
  const omen = model.omen;
  if (omen === null) {
    return (
      <p className={styles.omenEmpty}>
        An Omen Tower reveals the army 60s before it arrives.
      </p>
    );
  }
  return (
    <ul className={styles.omenArmy}>
      {CLASS_ORDER.map((classId) => {
        const count = omen.composition[classId];
        if (count === undefined) return null;
        return (
          <li data-class={classId} key={classId}>
            {CLASS_LABEL[classId]} {count}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Omen countdown and class mix. The number is not advanced locally.
 * @param props - Model, glossary opener, and an optional collapse action
 * @returns The Omen panel
 */
export function OmenPanel({
  model,
  onCallWaveEarly,
  onCollapse,
  onGlossary,
}: {
  model: ShellModel;
  /** Calls the next wave immediately for an early-call resource bonus. */
  onCallWaveEarly?: () => void;
  /** Folds the threat cluster back to its chip; omitted, no control shows. */
  onCollapse?: () => void;
  onGlossary: () => void;
}) {
  const wave = model.wave;
  const waveHeld = wave?.waveHeld === true;
  const canCallEarly =
    model.wave?.canCallEarly === true && onCallWaveEarly !== undefined;
  const bonusLabel = model.wave?.earlyCallBonusLabel;
  const etaSeconds = publishedWaveEta(model);
  return (
    <section aria-label="Omen panel" className={styles.omenPanel}>
      <div className={styles.omenHeading}>
        <h3 className={styles.panelTitle}>Omen</h3>
        <button
          aria-label="Open glossary from the Omen panel"
          className={styles.hudHelp}
          onClick={onGlossary}
          title="Glossary"
          type="button"
        >
          ?
        </button>
        {etaSeconds === null ? null : (
          <p
            className={`${styles.omenEta} ${model.paused || waveHeld ? styles.omenHeld : ""}`}
            data-testid="omen-countdown"
          >
            {waveHeld ? "Held" : formatEta(etaSeconds, model.paused)}
          </p>
        )}
        {onCollapse === undefined ? null : (
          <button
            aria-expanded={true}
            aria-label="Collapse pressure and omen"
            className={styles.hudCollapse}
            data-testid="threat-collapse"
            onClick={onCollapse}
            title="Collapse"
            type="button"
          >
            <Chevron direction="up" />
          </button>
        )}
      </div>
      <WaveDetails model={model} />
      {canCallEarly ? (
        <button
          className={styles.callWavePanelButton}
          data-testid="call-wave-early"
          onClick={onCallWaveEarly}
          type="button"
        >
          <span>Call next wave early</span>
          {bonusLabel === undefined ? null : (
            <span className={styles.callWaveBonus}>{bonusLabel}</span>
          )}
        </button>
      ) : null}
    </section>
  );
}
