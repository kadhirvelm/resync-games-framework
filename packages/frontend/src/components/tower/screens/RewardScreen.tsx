import { Heart, ShieldPlus } from "lucide-react";
import {
  FORTIFY_AMOUNT,
  MEND_SHARE,
  memberCard,
  memberProfile,
  type RewardChoice,
} from "../logic/run";
import type { RunState, TowerContent } from "../logic/towerTypes";
import { ownerCssColor, partyAccentIndex } from "../ownerColors";
import { Button } from "../parts/Button";
import { CorebornOffer } from "../parts/CorebornOffer";
import { GameCard } from "../parts/GameCard";
import { PartyLineup } from "../parts/PartyLineup";
import styles from "../tower.module.scss";
import { offeredTemplates, ownedTemplateCounts } from "./offerHelpers";

interface RewardScreenProps {
  content: TowerContent;
  onClaim: (choice: RewardChoice) => void;
  run: RunState;
}

/**
 * The cleared room's reward: one pick from its offer, or skip.
 * @param content - Tower content
 * @param onClaim - Applies the pick and climbs to the next floor
 * @param run - Run showing a reward
 * @returns The reward screen
 */
export const RewardScreen = ({ content, onClaim, run }: RewardScreenProps) => {
  const offer = run.pendingReward;
  if (!offer) {
    return null;
  }
  return (
    <main className={styles.screen}>
      <header className={styles.storyHeader}>
        <p className={styles.eyebrow}>Floor {run.floorIndex + 1} cleared</p>
        <h1>{rewardTitle(offer.kind)}</h1>
        <p className={styles.story}>{rewardDescription(offer.kind)}</p>
      </header>

      <section className={styles.panel}>
        {offer.kind === "coreborn" ? (
          <CorebornOffer
            onRecruit={(templateId) =>
              onClaim({ kind: "coreborn", templateId })
            }
            ownedCounts={ownedTemplateCounts(run)}
            templates={offeredTemplates(content, offer.templateIds)}
          />
        ) : null}

        {offer.kind === "techniques" ? (
          <div className={styles.cardChoices}>
            {offer.cards.map((card) => (
              <GameCard
                accent={ownerCssColor(0)}
                card={card}
                key={card.id}
                onClick={() => onClaim({ cardId: card.id, kind: "techniques" })}
                owner="Your cultivator"
              />
            ))}
          </div>
        ) : null}

        {offer.kind === "monster-cards" ? (
          <div className={styles.cardChoices}>
            {offer.memberIds.map((memberId) => {
              const member = run.party.find((entry) => entry.id === memberId);
              const card = member ? memberCard(member, content) : undefined;
              if (!member || !card) {
                return null;
              }
              const index = run.party.indexOf(member);
              const name = memberProfile(member, content).name;
              return (
                <GameCard
                  accent={ownerCssColor(
                    partyAccentIndex(
                      run.party.map((entry) => ({
                        isCultivator: entry.kind === "cultivator",
                      })),
                      index,
                    ),
                  )}
                  card={card}
                  footer={`${name} now brings ×${member.cardCopies + 1}`}
                  key={memberId}
                  onClick={() => onClaim({ kind: "monster-cards", memberId })}
                  owner={name}
                />
              );
            })}
          </div>
        ) : null}

        {offer.kind === "health" ? (
          <div className={styles.healthChoices}>
            <button
              className={styles.healthChoice}
              onClick={() => onClaim({ kind: "health", option: "mend" })}
              type="button"
            >
              <Heart size={28} />
              <strong>Mend</strong>
              <span>
                Every party member recovers {Math.round(MEND_SHARE * 100)}% of
                their maximum health.
              </span>
            </button>
            <button
              className={styles.healthChoice}
              onClick={() => onClaim({ kind: "health", option: "fortify" })}
              type="button"
            >
              <ShieldPlus size={28} />
              <strong>Fortify</strong>
              <span>
                Every party member gains {FORTIFY_AMOUNT} maximum health, and
                heals that much.
              </span>
            </button>
          </div>
        ) : null}
        <div className={styles.skipRow}>
          <Button onClick={() => onClaim({ kind: "skip" })} variant="quiet">
            Skip reward
          </Button>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Your party</h2>
        <PartyLineup content={content} run={run} />
      </section>
    </main>
  );
};

/**
 * @param kind - Reward kind
 * @returns Heading for the reward screen
 */
function rewardTitle(
  kind: NonNullable<RunState["pendingReward"]>["kind"],
): string {
  if (kind === "coreborn") {
    return "A Coreborn answers";
  }
  if (kind === "techniques") {
    return "A technique, remembered";
  }
  if (kind === "monster-cards") {
    return "Deepen a bond";
  }
  return "A moment to breathe";
}

/**
 * @param kind - Reward kind
 * @returns One line explaining the choice
 */
function rewardDescription(
  kind: NonNullable<RunState["pendingReward"]>["kind"],
): string {
  if (kind === "coreborn") {
    return "Recruit one. A second copy of a Coreborn you already have can be merged before the next battle.";
  }
  if (kind === "techniques") {
    return "Add one cultivation technique to your cultivator's cards. Your own cards only leave the deck if you fall.";
  }
  if (kind === "monster-cards") {
    return "Add another copy of a Coreborn's card. The copy upgrades when that Coreborn merges, and is lost if it falls.";
  }
  return "Tend to the party before climbing on.";
}
