/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { MAX_QUEUE } from "../logic/slice/sliceTraining";
import type { ClassId } from "../logic/types";
import styles from "./bottomHud.module.scss";
import { UNIT_TRAINING_GUIDES } from "./card";
import type { SelectionCard, SelectionFact } from "./inspect";
import type { TrainingQueueReadout } from "./presentation";
import type { SelectionGroup } from "./selection";
import type { ShellBuilding, ShellUnit } from "./shellModel";
import { CLASS_LABEL } from "./text";

/** Props for the bottom-left selection panel. */
export interface UnitPanelProps {
  /** Selected building, for its training queue. */
  building: ShellBuilding | null;
  /** What to show: name, summary, facts, and tips. */
  card: SelectionCard;
  /** Unit kinds in a mixed selection. */
  groups?: readonly SelectionGroup<ClassId>[];
  onCancelTraining?: (buildingId: string, jobId: string) => void;
  /** Clears the selection. Omit to hide the close button. */
  onClear?: () => void;
  onGlossary: () => void;
  onSelectGroup?: (unitIds: readonly string[]) => void;
  /** Primary selected unit, for its cultivation bars. */
  unit: ShellUnit | null;
}

/**
 * The bottom-left panel: what is selected, its key numbers, and what the
 * player can do with it. Units, groups, buildings, resource nodes, Spirit
 * Veins, vents, and stockpile entries all share one layout.
 * @param props - The card to show plus the selection details it summarizes
 * @returns The selection panel
 */
export function UnitPanel({
  building,
  card,
  groups = [],
  onCancelTraining,
  onClear,
  onGlossary,
  onSelectGroup,
  unit,
}: UnitPanelProps) {
  const showQueue =
    card.kind === "building" &&
    building !== null &&
    building.factionId === "hold" &&
    (building.trainingQueue.length > 0 || building.rallyPoint !== null);
  const cultivation = card.kind === "unit" ? (unit?.cultivation ?? null) : null;
  return (
    <section
      aria-label="Unit panel"
      className={styles.selection}
      data-kind={card.kind}
      data-tone={card.tone}
    >
      <header className={styles.identity}>
        <Portrait card={card} />
        <div className={styles.identityText}>
          <h3 className={styles.title}>{card.title}</h3>
          <p className={styles.subtitle}>{card.subtitle}</p>
          {card.health === null ? null : (
            <HealthBar max={card.health.max} value={card.health.value} />
          )}
        </div>
        <div className={styles.identityTools}>
          <button
            aria-label="Open glossary from the unit panel"
            className={styles.toolButton}
            onClick={onGlossary}
            title="Glossary"
            type="button"
          >
            ?
          </button>
          {onClear === undefined || card.kind === "empty" ? null : (
            <button
              aria-label="Clear selection"
              className={styles.toolButton}
              onClick={onClear}
              title="Clear selection (Esc)"
              type="button"
            >
              ×
            </button>
          )}
        </div>
      </header>
      <div className={styles.details}>
        <p className={styles.summary}>
          <span className={styles.srOnly}>What it is: </span>
          {card.summary}
        </p>
        {card.facts.length === 0 ? null : <Facts facts={card.facts} />}
        {card.kind === "group" ? (
          <SelectionGroups groups={groups} onSelectGroup={onSelectGroup} />
        ) : null}
        {cultivation === null ? null : (
          <div className={styles.bars}>
            <FillBar
              label="Merit"
              max={cultivation.meritToNext}
              value={cultivation.merit}
            />
            <FillBar
              label="Essence"
              max={cultivation.essenceToNext}
              value={cultivation.essence}
            />
          </div>
        )}
        {showQueue && building !== null ? (
          <TrainingQueue building={building} onCancel={onCancelTraining} />
        ) : null}
      </div>
      <div className={styles.tips}>
        <h4 className={styles.tipsHeading}>What you can do</h4>
        <ul className={styles.tipList}>
          {card.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * The selection's icon, or a lettered badge when it has none.
 * @param props - The selection card
 * @returns The portrait
 */
function Portrait({ card }: { card: SelectionCard }) {
  return (
    <span aria-hidden="true" className={styles.portrait}>
      {card.iconSrc === null ? (
        <span className={styles.portraitGlyph}>{card.glyph}</span>
      ) : (
        // biome-ignore lint/performance/noImgElement: bundled game HUD icon
        <img alt="" className={styles.portraitIcon} src={card.iconSrc} />
      )}
    </span>
  );
}

/**
 * A health bar with its numbers.
 * @param props - Current and full hit points
 * @returns The bar
 */
function HealthBar({ max, value }: { max: number; value: number }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={styles.health}>
      <meter
        aria-label="Health"
        className={styles.healthMeter}
        data-low={ratio <= 0.35}
        high={0.66}
        low={0.35}
        max={1}
        min={0}
        optimum={1}
        value={ratio}
      />
      <span className={styles.healthText}>
        HP {Math.round(value)}/{Math.round(max)}
      </span>
    </div>
  );
}

/**
 * A labeled fill bar.
 * @param props - Label, current value, and full value
 * @returns The bar
 */
function FillBar({
  label,
  max,
  value,
}: {
  label: string;
  max: number;
  value: number;
}) {
  return (
    <div className={styles.fillBar}>
      <span className={styles.fillLabel}>
        {label}{" "}
        <strong>
          {value}/{max}
        </strong>
      </span>
      <meter
        aria-label={label}
        className={styles.fillMeter}
        max={max > 0 ? max : 1}
        min={0}
        value={value}
      />
    </div>
  );
}

/**
 * Key numbers for the selection, laid out as label-over-value chips.
 * @param props - Facts to show
 * @returns The fact row
 */
function Facts({ facts }: { facts: readonly SelectionFact[] }) {
  return (
    <dl className={styles.facts}>
      {facts.map((fact) => (
        <div className={styles.fact} key={fact.label} title={fact.title}>
          <dt>{fact.label}</dt>{" "}
          <dd>
            {fact.iconSrc === undefined ? null : (
              // biome-ignore lint/performance/noImgElement: bundled game HUD icon
              <img alt="" height={14} src={fact.iconSrc} width={14} />
            )}
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Icons for each kind of unit in a mixed selection. Clicking one narrows the
 * selection to that group.
 * @param props - Groups in the selection and the callback that selects one
 * @returns The group grid
 */
function SelectionGroups({
  groups,
  onSelectGroup,
}: {
  groups: readonly SelectionGroup<ClassId>[];
  onSelectGroup?: (unitIds: readonly string[]) => void;
}) {
  return (
    <ul aria-label="Selected unit groups" className={styles.groups}>
      {groups.map((group) => {
        const enemy = group.factionId === "horde";
        const name = `${enemy ? "Enemy " : ""}${CLASS_LABEL[group.classId]}`;
        return (
          <li key={group.key}>
            <button
              aria-label={`Select ${group.unitIds.length} ${name}`}
              className={styles.group}
              data-enemy={enemy}
              onClick={() => onSelectGroup?.(group.unitIds)}
              title={`${name} — click to select only these`}
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: bundled game HUD icon */}
              <img
                alt=""
                className={styles.groupIcon}
                src={UNIT_TRAINING_GUIDES[group.classId].iconSrc}
              />
              <span className={styles.groupCount}>{group.unitIds.length}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Empty slots kept on the first row so a short queue still reads as a queue. */
const QUEUE_ROW = 5;

/**
 * A training building's queue: the order in progress, waiting orders, and
 * empty slots on the first row. Longer queues scroll instead of growing the
 * panel out to the 20-order cap.
 * @param props - The building and the cancel callback
 * @returns The queue
 */
function TrainingQueue({
  building,
  onCancel,
}: {
  building: ShellBuilding;
  onCancel?: (buildingId: string, jobId: string) => void;
}) {
  const slots = Math.max(
    building.trainingQueue.length,
    Math.min(QUEUE_ROW, MAX_QUEUE),
  );
  return (
    <ol aria-label="Training queue" className={styles.queue}>
      {Array.from({ length: slots }, (_, slot) => (
        <TrainingQueueSlot
          job={building.trainingQueue[slot]}
          key={building.trainingQueue[slot]?.id ?? `empty-${slot}`}
          onCancel={
            onCancel === undefined
              ? undefined
              : (jobId) => onCancel(building.id, jobId)
          }
          training={slot === 0}
        />
      ))}
    </ol>
  );
}

/**
 * One slot of a training building's queue: the order in progress with its
 * progress bar, a waiting order, or an empty slot. Orders can be cancelled.
 * @param props - The order in this slot, whether it is training, and cancel
 * @returns The queue list item
 */
function TrainingQueueSlot({
  job,
  onCancel,
  training,
}: {
  job: TrainingQueueReadout | undefined;
  onCancel?: (jobId: string) => void;
  training: boolean;
}) {
  if (job === undefined) {
    return (
      <li aria-label="Empty queue slot" className={styles.queueEmpty}>
        <span aria-hidden="true">—</span>
      </li>
    );
  }
  const name = job.count > 1 ? `${job.label} ×${job.count}` : job.label;
  return (
    <li className={styles.queueItem} data-active={training}>
      <span className={styles.queueName}>{name}</span>
      {training ? (
        <span className={styles.queueState}>
          {Math.round(job.progress * 100)}%
        </span>
      ) : (
        <span className={styles.queueState}>Queued</span>
      )}
      {onCancel === undefined ? null : (
        <button
          aria-label={`Cancel ${name}`}
          className={styles.queueCancel}
          onClick={() => onCancel(job.id)}
          title="Cancel and refund"
          type="button"
        >
          ×
        </button>
      )}
      {training ? (
        <meter
          aria-label={`${job.label} training progress`}
          className={styles.queueProgress}
          max={1}
          min={0}
          value={job.progress}
        />
      ) : null}
    </li>
  );
}
