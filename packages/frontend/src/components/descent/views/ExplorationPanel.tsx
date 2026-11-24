/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { memo, useState } from "react";
import type { ClassId } from "../logic/types";
import styles from "./explorationPanel.module.scss";
import type {
  ExplorationCampReadout,
  ExplorationReadout,
} from "./presentation";
import { CLASS_LABEL } from "./text";

/** Props for the self-paced camp tracker. */
export interface ExplorationPanelProps {
  exploration: ExplorationReadout;
  /** Centers the battlefield and opens a camp's inspection card. */
  onFocusCamp: (camp: ExplorationCampReadout) => void;
}

/**
 * Shows only camps the Hold has discovered, with fixed threat, live guard
 * counts, and exact prizes. The total hints how much remains in the fog
 * without leaking hidden names or locations.
 * @param props - Fog-safe camp progress and focus callback
 * @returns The exploration objective panel
 */
export const ExplorationPanel = memo(function ExplorationPanel({
  exploration,
  onFocusCamp,
}: ExplorationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const remaining = exploration.totalCamps - exploration.clearedCamps;
  return (
    <section
      aria-label="Exploration camps"
      className={styles.panel}
      data-testid="exploration-panel"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Exploration</span>
          <h2>
            {exploration.clearedCamps}/{exploration.totalCamps} camps cleared
          </h2>
        </div>
        <button
          aria-expanded={expanded}
          aria-label={
            expanded ? "Collapse camp tracker" : "Expand camp tracker"
          }
          className={styles.collapse}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "−" : "+"}
        </button>
      </header>
      <p className={styles.modeLine}>
        No timed waves · fixed camp strength · {remaining} remaining
        {exploration.pendingCaches > 0
          ? ` · ${exploration.pendingCaches} awaiting haul`
          : ""}
      </p>
      {!expanded ? null : (
        <div className={styles.content}>
          {exploration.camps.length === 0 ? (
            <p className={styles.empty}>
              {remaining === 0
                ? "Every guarded prize is secured."
                : "Scout the fog to find guarded prizes."}
            </p>
          ) : (
            <ol className={styles.camps}>
              {exploration.camps.map((camp) => (
                <CampRow camp={camp} key={camp.id} onFocus={onFocusCamp} />
              ))}
            </ol>
          )}
          {exploration.undiscoveredCamps === 0 ? null : (
            <p className={styles.scoutHint}>
              Scout the fog: {exploration.undiscoveredCamps} more{" "}
              {exploration.undiscoveredCamps === 1 ? "camp" : "camps"} hidden.
            </p>
          )}
          <p className={styles.orderHint}>
            Fight guards with soldiers. Then select a villager or Qi cultivator
            and right-click each resource cache to haul its full load home.
          </p>
        </div>
      )}
    </section>
  );
});

/**
 * One discovered camp and its advertised prize.
 * @param props - Camp readout and focus callback
 * @returns A focusable camp tracker row
 */
function CampRow({
  camp,
  onFocus,
}: {
  camp: ExplorationCampReadout;
  onFocus: (camp: ExplorationCampReadout) => void;
}) {
  let guardLabel = camp.cleared
    ? "Haul cache"
    : `${camp.guardsRemaining}/${camp.guardsTotal} guards`;
  if (camp.reinforcements > 0) {
    guardLabel += ` · +${camp.reinforcements} imps`;
  }
  const composition = Object.entries(camp.guardComposition)
    .filter((entry): entry is [ClassId, number] => {
      const [classId, count] = entry;
      return classId in CLASS_LABEL && typeof count === "number" && count > 0;
    })
    .map(([classId, count]) => `${count} ${CLASS_LABEL[classId]}`)
    .join(" · ");
  return (
    <li className={styles.camp} data-cleared={camp.rewardCollected}>
      <button
        aria-label={`Focus ${camp.name}, Threat ${camp.threat}`}
        className={styles.campButton}
        onClick={() => onFocus(camp)}
        type="button"
      >
        <span className={styles.campHeading}>
          <span className={styles.threat}>Threat {camp.threat}</span>
          <strong>{camp.name}</strong>
          <span className={styles.guardCount}>{guardLabel}</span>
        </span>
        {camp.cleared ? null : (
          <span className={styles.roster}>{composition}</span>
        )}
        <span className={styles.reward}>
          {camp.cleared ? "Haul: " : "Prize: "}
          {camp.rewardLabel}
        </span>
      </button>
    </li>
  );
}
