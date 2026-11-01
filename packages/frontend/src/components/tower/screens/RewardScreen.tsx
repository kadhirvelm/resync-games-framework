import { Heart, ShieldPlus, Shuffle } from "lucide-react";
import { playSound } from "../audio/sound";
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
import { ChoiceSlot } from "../parts/ChoiceSlot";
import { CorebornOffer } from "../parts/CorebornOffer";
import { GameCard } from "../parts/GameCard";
import { PartyLineup } from "../parts/PartyLineup";
import { useChoiceFlourish } from "../parts/useChoiceFlourish";
import { useStaggeredSounds } from "../parts/useStaggeredSounds";
import styles from "../tower.module.scss";
import { offeredTemplates, ownedTemplateCounts } from "./offerHelpers";

interface RewardScreenProps {
  content: TowerContent;
  onClaim: (choice: RewardChoice) => void;
  onReroll: () => void;
  /** Claim at once, without the celebration */
  reducedMotion: boolean;
  run: RunState;
}

/**
 * The cleared room's reward: one pick from its offer, or skip. The offer
 * is dealt in with a flip of each card, and a pick bursts before the climb
 * moves on.
 * @param content - Tower content
 * @param onClaim - Applies the pick and climbs to the next floor
 * @param onReroll - Spends one of Fate's Thread's rerolls on a new offer
 * @param reducedMotion - Claim without the celebration
 * @param run - Run showing a reward
 * @returns The reward screen
 */
export const RewardScreen = ({
  content,
  onClaim,
  onReroll,
  reducedMotion,
  run,
}: RewardScreenProps) => {
  const { choose, chosen } = useChoiceFlourish(reducedMotion, {
    hold: true,
    sound: "reward",
  });
  const offer = run.pendingReward;
  // A new key replays the entrance when a reroll swaps the offer.
  const offerKey = JSON.stringify(offer);
  useStaggeredSounds(
    "flip",
    reducedMotion ? 0 : offerSize(offer),
    { pitchStep: 0.06, startMs: 140, stepMs: 110 },
    offerKey,
  );
  if (!offer) {
    return null;
  }
  const canReroll = run.modifiers.rerollsLeft > 0 && offer.kind !== "health";

  /**
   * @param key - Option being picked
   * @param choice - What the pick claims
   */
  const pick = (key: string, choice: RewardChoice) =>
    choose(key, () => onClaim(choice));
  return (
    <main className={styles.screen}>
      <header className={styles.storyHeader}>
        <span aria-hidden="true" className={styles.clearedSeal}>
          {run.floorIndex + 1}
        </span>
        <p className={styles.eyebrow}>Floor {run.floorIndex + 1} cleared</p>
        <h1>{rewardTitle(offer.kind)}</h1>
        <p className={styles.story}>{rewardDescription(offer.kind)}</p>
      </header>

      <section className={styles.panel} key={offerKey}>
        {offer.kind === "coreborn" ? (
          <CorebornOffer
            chosenId={chosen}
            onRecruit={(templateId) =>
              pick(templateId, { kind: "coreborn", templateId })
            }
            ownedCounts={ownedTemplateCounts(run)}
            templates={offeredTemplates(content, offer.templateIds)}
          />
        ) : null}

        {offer.kind === "techniques" ? (
          <div className={styles.cardChoices}>
            {offer.cards.map((card) => (
              <ChoiceSlot chosenKey={chosen} key={card.id} slotKey={card.id}>
                <GameCard
                  accent={ownerCssColor(0)}
                  card={card}
                  onClick={() =>
                    pick(card.id, { cardId: card.id, kind: "techniques" })
                  }
                  owner="Your cultivator"
                />
              </ChoiceSlot>
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
                <ChoiceSlot
                  chosenKey={chosen}
                  key={memberId}
                  slotKey={memberId}
                >
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
                    onClick={() =>
                      pick(memberId, { kind: "monster-cards", memberId })
                    }
                    owner={name}
                  />
                </ChoiceSlot>
              );
            })}
          </div>
        ) : null}

        {offer.kind === "health" ? (
          <div className={styles.healthChoices}>
            <ChoiceSlot chosenKey={chosen} slotKey="mend">
              <button
                className={styles.healthChoice}
                onClick={() => pick("mend", { kind: "health", option: "mend" })}
                onMouseEnter={() => playSound("hover")}
                type="button"
              >
                <Heart size={28} />
                <strong>Mend</strong>
                <span>
                  Every party member recovers {Math.round(MEND_SHARE * 100)}% of
                  their maximum health.
                </span>
              </button>
            </ChoiceSlot>
            <ChoiceSlot chosenKey={chosen} slotKey="fortify">
              <button
                className={styles.healthChoice}
                onClick={() =>
                  pick("fortify", { kind: "health", option: "fortify" })
                }
                onMouseEnter={() => playSound("hover")}
                type="button"
              >
                <ShieldPlus size={28} />
                <strong>Fortify</strong>
                <span>
                  Every party member gains {FORTIFY_AMOUNT} maximum health, and
                  heals that much.
                </span>
              </button>
            </ChoiceSlot>
          </div>
        ) : null}
        <div className={styles.skipRow}>
          {canReroll ? (
            <Button
              className={styles.rerollButton}
              disabled={chosen !== undefined}
              onClick={() => {
                playSound("whoosh");
                onReroll();
              }}
              variant="quiet"
            >
              <Shuffle size={16} /> Pull Fate&apos;s Thread ·{" "}
              {run.modifiers.rerollsLeft} left
            </Button>
          ) : null}
          <Button
            disabled={chosen !== undefined}
            onClick={() => {
              playSound("back");
              onClaim({ kind: "skip" });
            }}
            variant="quiet"
          >
            Skip reward
          </Button>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Your party</h2>
        <PartyLineup content={content} reducedMotion={true} run={run} />
      </section>
    </main>
  );
};

/**
 * @param offer - Pending reward, if any
 * @returns How many options it deals out
 */
function offerSize(offer: RunState["pendingReward"]): number {
  if (!offer) {
    return 0;
  }
  if (offer.kind === "coreborn") {
    return offer.templateIds.length;
  }
  if (offer.kind === "techniques") {
    return offer.cards.length;
  }
  if (offer.kind === "monster-cards") {
    return offer.memberIds.length;
  }
  return 2;
}

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
