import clsx from "clsx";
import type { ReactNode } from "react";
import { describeEffect } from "../logic/cardRules";
import type { CardDefinition } from "../logic/towerTypes";
import styles from "../tower.module.scss";
import { LeafIcon } from "./LeafIcon";

/** Art-panel wash for each card kind when the card has no illustration. */
const KIND_CLASSES: Record<string, string | undefined> = {
  aether: styles.kindAether,
  attack: styles.kindAttack,
  combo: styles.kindCombo,
  defend: styles.kindDefend,
  draw: styles.kindDraw,
};

interface GameCardProps {
  /** Owner ribbon color */
  accent?: string;
  card: CardDefinition;
  /** Extra line under the card, such as a copy count */
  footer?: ReactNode;
  /** Whether to show the lore line */
  showFlavor?: boolean;
  /** Ring the card, for the chosen or current option */
  highlighted?: boolean;
  /** Makes the card a button */
  onClick?: () => void;
  /** Name on the owner ribbon */
  owner?: string;
  size?: "small" | "normal";
}

/**
 * One card as it looks outside battle: cost leaf, art, rules, lore, owner.
 * @param props - Card, owner, and presentation options
 * @returns The card, as a button when `onClick` is set
 */
export const GameCard = ({
  accent,
  card,
  footer,
  highlighted = false,
  onClick,
  owner,
  showFlavor = true,
  size = "normal",
}: GameCardProps) => {
  const kind = card.rules.effects[0]?.kind ?? "attack";
  const body = (
    <>
      <LeafIcon
        className={styles.cardCost}
        label={card.rules.aetherCost}
        size={size === "small" ? 26 : 32}
      />
      <span className={styles.cardName}>
        {card.rules.name}
        <span className={styles.srOnly}>
          , costs {card.rules.aetherCost} Aether.
        </span>
      </span>
      <span className={clsx(styles.cardArt, KIND_CLASSES[kind])}>
        {card.imageUrl ? (
          // biome-ignore lint/performance/noImgElement: generated art is served by the backend
          <img alt="" src={card.imageUrl} />
        ) : (
          <LeafIcon size={size === "small" ? 30 : 44} />
        )}
      </span>
      <span className={styles.cardRules}>
        {card.rules.effects.map((effect, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: effects are fixed for a card
          <span key={index}>{describeEffect(effect)}</span>
        ))}
      </span>
      {showFlavor && card.flavor && size === "normal" ? (
        <span className={styles.cardFlavor}>{card.flavor}</span>
      ) : null}
      {owner ? (
        <span className={styles.cardOwner} style={{ background: accent }}>
          {owner}
        </span>
      ) : null}
    </>
  );
  const className = clsx(
    styles.card,
    size === "small" && styles.cardSmall,
    highlighted && styles.cardHighlighted,
    onClick && styles.cardButton,
  );
  return (
    <div className={styles.cardWrap}>
      {onClick ? (
        <button className={className} onClick={onClick} type="button">
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
      {footer ? <div className={styles.cardFooter}>{footer}</div> : null}
    </div>
  );
};
