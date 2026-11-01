import { memberProfile, runDeck } from "../logic/run";
import type {
  CardDefinition,
  RunState,
  TowerContent,
} from "../logic/towerTypes";
import { ownerCssColor, partyAccentIndex } from "../ownerColors";
import styles from "../tower.module.scss";
import { GameCard } from "./GameCard";

/**
 * Every card in the deck, grouped by the party member who brings it.
 * @param content - Tower content
 * @param run - Current run
 * @returns The grouped deck
 */
export const DeckList = ({
  content,
  run,
}: {
  content: TowerContent;
  run: RunState;
}) => {
  const deck = runDeck(run, content);
  const accentParty = run.party.map((member) => ({
    isCultivator: member.kind === "cultivator",
  }));
  return (
    <div className={styles.deck}>
      <p className={styles.muted}>{deck.length} cards. You draw 5 each turn.</p>
      {run.party.map((member, index) => {
        const counts = new Map<
          string,
          { card: CardDefinition; copies: number }
        >();
        for (const entry of deck.filter((card) => card.ownerId === member.id)) {
          const existing = counts.get(entry.definition.id);
          counts.set(entry.definition.id, {
            card: entry.definition,
            copies: (existing?.copies ?? 0) + 1,
          });
        }
        const name = memberProfile(member, content).name;
        return (
          <div className={styles.deckGroup} key={member.id}>
            <h3>{name}</h3>
            <div className={styles.deckCards}>
              {[...counts.values()].map(({ card, copies }) => (
                <GameCard
                  accent={ownerCssColor(partyAccentIndex(accentParty, index))}
                  card={card}
                  footer={`×${copies}`}
                  key={card.id}
                  owner={name}
                  showFlavor={false}
                  size="small"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
