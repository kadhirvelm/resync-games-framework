import Link from "next/link";
import { ProductNowConnection } from "@/components/productNow/ProductNowConnection";
import type { TowerChoice } from "../logic/buildTowerContent";
import { Button } from "../parts/Button";
import { LeafIcon } from "../parts/LeafIcon";
import styles from "../tower.module.scss";

interface TitleScreenProps {
  choices: TowerChoice[];
  isLoading: boolean;
  onClimb: (choice: TowerChoice) => void;
  warnings: string[];
}

const SOURCE_LABELS: Record<TowerChoice["source"], string> = {
  "built-in": "Built-in",
  dungeon: "Dungeon package",
  gallery: "Workshop gallery",
};

/**
 * Entry screen: pick a tower to climb. Generated dungeons come first; the
 * built-in tower is always there, even when the backend is unreachable.
 * @param choices - Towers that can be climbed
 * @param isLoading - Whether the workshop is still being read
 * @param onClimb - Starts a run in the chosen tower
 * @param warnings - Lists that could not be read
 * @returns The title screen
 */
export const TitleScreen = ({
  choices,
  isLoading,
  onClimb,
  warnings,
}: TitleScreenProps) => (
  <main className={styles.screen}>
    <div className={styles.titleTopBar}>
      <Link className={styles.quietLink} href="/assets">
        Blueprint Workshop
      </Link>
      <ProductNowConnection placement="inline" />
    </div>
    <header className={styles.hero}>
      <LeafIcon className={styles.heroLeaf} size={56} />
      <h1>Towers of Coreborn</h1>
      <p>
        Gather Coreborn, climb the tower floor by floor, and quiet the heart at
        its summit. When the cultivator falls, the climb begins again.
      </p>
    </header>

    <section aria-labelledby="tower-choices" className={styles.panel}>
      <h2 id="tower-choices">Choose a tower</h2>
      {isLoading ? (
        <p className={styles.muted}>Reading the Blueprint Workshop…</p>
      ) : null}
      <ul className={styles.towerList}>
        {choices.map((choice) => (
          <li className={styles.towerChoice} key={choice.id}>
            <div>
              <p className={styles.eyebrow}>
                {SOURCE_LABELS[choice.source]}
                {choice.source === "dungeon"
                  ? ` · ${choice.readySlots} of ${choice.totalSlots} assets generated`
                  : null}
              </p>
              <h3>{choice.title}</h3>
              <p className={styles.towerSummary}>{choice.summary}</p>
            </div>
            <Button onClick={() => onClimb(choice)}>Climb</Button>
          </li>
        ))}
      </ul>
      {warnings.length > 0 ? (
        <p className={styles.warning}>
          Some workshop lists could not be read, so missing pieces use built-in
          stand-ins. {warnings.join(" · ")}
        </p>
      ) : null}
    </section>

    <section aria-labelledby="how-to-play" className={styles.panel}>
      <h2 id="how-to-play">How a climb works</h2>
      <ul className={styles.rules}>
        <li>
          Recruit Coreborn. Each one adds its own cards to your deck; your
          cultivator brings qi techniques.
        </li>
        <li>
          Order the party between battles. The front takes most hits; some
          attacks reach the back line or the whole party.
        </li>
        <li>
          Each turn you draw 5 cards and get 3 Aether. Enemies show exactly what
          they will do before you act, and act from right to left.
        </li>
        <li>
          Two copies of the same Coreborn merge into a stronger tier between
          battles, swapping its cards for upgraded ones. Tier 4 is the peak.
        </li>
        <li>
          A fallen Coreborn takes its cards with it. If your cultivator falls,
          the run ends and nothing carries over.
        </li>
      </ul>
    </section>
  </main>
);
