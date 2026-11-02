/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { SIM_SPEEDS, type SimSpeed } from "../logic/sim/constants";
import { RESOURCE_IDS } from "../logic/types";
import styles from "./descentView.module.scss";
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

/**
 * Eight resources, population, pause, and speed.
 * @param props - Model and sim clock callbacks
 * @returns The resource bar
 */
export function ResourceBar({
  model,
  onSelectResource,
  onSetPaused,
  onSetSpeed,
  selectedResource = null,
}: {
  model: ShellModel;
  onSelectResource?: (resource: ResourceSelectionId) => void;
  onSetPaused?: (paused: boolean) => void;
  onSetSpeed?: (speed: SimSpeed) => void;
  selectedResource?: ResourceSelectionId | null;
}) {
  const pop = model.pop === null ? "—" : `${model.pop.used}/${model.pop.cap}`;
  return (
    <div className={styles.resources}>
      <div className={styles.resourceLedger}>
        {RESOURCE_IDS.map((resourceId) => {
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
      </div>
      <div className={styles.clockControls}>
        <button
          aria-pressed={model.paused}
          className={styles.pauseButton}
          onClick={() => onSetPaused?.(!model.paused)}
          type="button"
        >
          {model.paused ? "Resume" : "Pause"}
        </button>
        <div className={styles.speedGroup}>
          {SIM_SPEEDS.map((speed) => (
            <button
              aria-pressed={model.speed === speed}
              className={styles.speed}
              key={speed}
              onClick={() => onSetSpeed?.(speed)}
              type="button"
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

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
 * Persistent overview of every live training batch. Selecting an entry jumps
 * the contextual panel to that building.
 * @param props - Buildings and selection callback
 * @returns The tracker, or nothing when the Hold is not training
 */
export function TrainingTracker({
  buildings,
  onSelectBuilding,
}: {
  buildings: readonly ShellBuilding[];
  onSelectBuilding: (id: string) => void;
}) {
  const active = buildings.filter(
    (building) => building.trainingQueue.length > 0,
  );
  if (active.length === 0) return null;

  return (
    <section aria-label="Active training" className={styles.trainingTracker}>
      <header className={styles.trainingTrackerHeader}>
        <span aria-hidden="true" className={styles.trainingTrackerPulse} />
        <strong>Training</strong>
        <span>{active.length}</span>
      </header>
      <div className={styles.trainingTrackerList}>
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
      </div>
    </section>
  );
}

/**
 * Hell Pressure meter. The value is the snapshot's published ratio.
 * @param model - Shell model
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
    </section>
  );
}

/**
 * Omen countdown and class mix. The number is not advanced locally.
 * @param props - Model and glossary opener
 * @returns The Omen panel
 */
export function OmenPanel({
  model,
  onGlossary,
}: {
  model: ShellModel;
  onGlossary: () => void;
}) {
  const omen = model.omen;
  return (
    <section aria-label="Omen panel" className={styles.omenPanel}>
      <div className={styles.omenHeading}>
        <h3 className={styles.panelTitle}>Omen</h3>
      </div>
      {omen === null ? (
        <p className={styles.omenEmpty}>No wave</p>
      ) : (
        <>
          <p
            className={`${styles.omenEta} ${model.paused ? styles.omenHeld : ""}`}
            data-testid="omen-countdown"
          >
            {formatEta(omen.etaSeconds, model.paused)}
          </p>
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
        </>
      )}
      <button
        aria-label="Open glossary from the Omen panel"
        className={styles.intelButton}
        onClick={onGlossary}
        type="button"
      >
        ?
      </button>
    </section>
  );
}
