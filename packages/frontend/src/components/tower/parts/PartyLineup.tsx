import clsx from "clsx";
import { ChevronLeft, ChevronRight, Swords } from "lucide-react";
import { useRef, useState } from "react";
import { playSound } from "../audio/sound";
import { memberCard, memberProfile } from "../logic/run";
import type { RunState, TowerContent } from "../logic/towerTypes";
import {
  CULTIVATOR_GLYPH,
  ownerCssColor,
  partyAccentIndex,
} from "../ownerColors";
import styles from "../tower.module.scss";
import { TierLeaves } from "./TierLeaves";
import { UnitPortrait } from "./UnitPortrait";
import { useFlip } from "./useFlip";

interface PartyLineupProps {
  content: TowerContent;
  /** Omit to show the lineup read-only */
  onMove?: (fromIndex: number, toIndex: number) => void;
  /** Snap instead of sliding when the order changes */
  reducedMotion?: boolean;
  run: RunState;
}

/**
 * @param index - Position in the party
 * @param size - Party size
 * @returns "Front", "Back", or the position number
 */
function positionLabel(index: number, size: number): string {
  if (index === 0) {
    return "Front";
  }
  if (index === size - 1) {
    return "Back";
  }
  return `#${index + 1}`;
}

/**
 * The party in battle order, drawn exactly as it will stand: back on the
 * left, front on the right facing the enemies. Drag a member, or use the
 * arrows, to reorder.
 * Members slide to their new places when the order changes, breathe
 * gently while they wait, and the slot under a dragged member lights up.
 * @param content - Tower content
 * @param onMove - Moves a member from one position to another
 * @param reducedMotion - Snap instead of sliding
 * @param run - Current run
 * @returns The lineup
 */
export const PartyLineup = ({
  content,
  onMove,
  reducedMotion = false,
  run,
}: PartyLineupProps) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const row = useRef<HTMLOListElement>(null);
  useFlip(
    row,
    run.party.map((member) => `${member.id}:${member.tier}`).join(","),
    reducedMotion,
  );

  /**
   * @param fromIndex - Current position
   * @param toIndex - New position
   */
  const move = (fromIndex: number, toIndex: number) => {
    if (!onMove || fromIndex === toIndex) {
      return;
    }
    playSound("select");
    onMove(fromIndex, toIndex);
  };
  const size = run.party.length;
  const accentParty = run.party.map((member) => ({
    isCultivator: member.kind === "cultivator",
  }));
  const displayed = run.party
    .map((member, index) => ({ index, member }))
    .reverse();

  return (
    <div className={styles.lineup}>
      <ol
        aria-label="Party order, back to front"
        className={styles.lineupRow}
        ref={row}
      >
        {displayed.map(({ index, member }, order) => {
          const profile = memberProfile(member, content, run);
          const card =
            member.kind === "coreborn"
              ? memberCard(member, content)
              : undefined;
          const accent = ownerCssColor(partyAccentIndex(accentParty, index));
          return (
            <li
              className={clsx(
                styles.member,
                onMove && styles.memberMovable,
                member.kind === "cultivator" && styles.memberCultivator,
                dragIndex === index && styles.memberDragging,
                dragIndex !== null &&
                  dragIndex !== index &&
                  dropIndex === index &&
                  styles.memberDropTarget,
              )}
              data-flip-key={member.id}
              draggable={onMove !== undefined}
              key={member.id}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
              onDragEnter={() => {
                if (dragIndex !== null && dropIndex !== index) {
                  playSound("tick");
                }
                setDropIndex(index);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => {
                playSound("pop");
                setDragIndex(index);
              }}
              onDrop={() => {
                if (dragIndex !== null) {
                  move(dragIndex, index);
                }
                setDragIndex(null);
                setDropIndex(null);
              }}
              style={{ "--i": order } as React.CSSProperties}
            >
              <span className={styles.memberPosition}>
                {positionLabel(index, size)}
              </span>
              <UnitPortrait
                accent={accent}
                glyph={
                  member.kind === "cultivator" ? CULTIVATOR_GLYPH : undefined
                }
                name={profile.name}
                size="medium"
                url={profile.portraitUrl}
              />
              <strong className={styles.memberName}>{profile.name}</strong>
              <span className={styles.memberTitle}>
                {member.kind === "cultivator" ? "You" : profile.title}
              </span>
              {member.kind === "coreborn" ? (
                <TierLeaves tier={member.tier} />
              ) : null}
              <span
                className={styles.healthBar}
                style={
                  {
                    "--accent": accent,
                    "--fill": `${(member.hitPoints / member.maxHitPoints) * 100}%`,
                    "--hp-color":
                      member.hitPoints / member.maxHitPoints < 0.35
                        ? "#b5543f"
                        : accent,
                  } as React.CSSProperties
                }
              >
                <span>
                  {member.hitPoints} / {member.maxHitPoints}
                </span>
              </span>
              <span className={styles.memberBrings}>
                {card
                  ? `${card.rules.name} ×${member.cardCopies}`
                  : `${run.cultivatorDeck.length} techniques`}
              </span>
              {onMove ? (
                <span className={styles.memberMoves}>
                  <button
                    aria-label={`Move ${profile.name} back`}
                    disabled={index === size - 1}
                    onClick={() => move(index, index + 1)}
                    type="button"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    aria-label={`Move ${profile.name} forward`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    type="button"
                  >
                    <ChevronRight size={16} />
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <span aria-hidden="true" className={styles.lineupFacing}>
        <Swords size={18} /> enemies
      </span>
    </div>
  );
};
