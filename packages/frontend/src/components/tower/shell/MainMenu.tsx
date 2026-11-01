import clsx from "clsx";
import { Gem } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ProductNowConnection } from "@/components/productNow/ProductNowConnection";
import { playSound } from "../audio/sound";
import type { PlayerProfile } from "../logic/progression";
import type { SavedClimb } from "../logic/saveGame";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { ascensionNumeral, formatTimeAgo } from "./formatTime";
import styles from "./shell.module.scss";

interface MainMenuProps {
  /** Whether some upgrade can be bought right now */
  canCultivate: boolean;
  /** Most recently played saved climb */
  latestSave?: SavedClimb;
  onChronicle: () => void;
  onContinue: (saved: SavedClimb) => void;
  onCultivation: () => void;
  onNewClimb: () => void;
  onSettings: () => void;
  profile: PlayerProfile;
  reducedMotion: boolean;
  /** Number of saved climbs across every tower */
  saveCount: number;
}

/**
 * Moves focus between menu entries with the arrow keys, wrapping at the ends.
 * @param event - Key event from the menu list
 */
function moveMenuFocus(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-menu-item]"),
  );
  const current = items.indexOf(document.activeElement as HTMLElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  const next = items[(current + step + items.length) % items.length];
  event.preventDefault();
  next?.focus();
  playSound("hover");
}

/**
 * The title scene: the tower at dusk and the main menu. Continue leads when
 * a climb is saved; otherwise a new climb does.
 * @param props - Profile, latest save, and menu actions
 * @returns The main menu
 */
export const MainMenu = ({
  canCultivate,
  latestSave,
  onChronicle,
  onContinue,
  onCultivation,
  onNewClimb,
  onSettings,
  profile,
  reducedMotion,
  saveCount,
}: MainMenuProps) => {
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstItem.current?.focus({ preventScroll: true });
  }, []);

  /**
   * @param action - Menu action to run after the confirm sound
   * @returns Click handler
   */
  const choose = (action: () => void) => () => {
    playSound("confirm");
    action();
  };

  const continueLine = latestSave
    ? `${latestSave.content.title} · Floor ${latestSave.run.floorIndex + 1} of ${latestSave.run.rooms.length}${latestSave.run.ascension > 0 ? ` · Ascension ${ascensionNumeral(latestSave.run.ascension)}` : ""}`
    : undefined;

  return (
    <div className={styles.menuScene}>
      <AmbientBackdrop reducedMotion={reducedMotion} variant="dusk" />
      <div className={styles.menuTopBar}>
        <Link className={styles.menuQuietLink} href="/assets">
          Blueprint Workshop
        </Link>
        <span className={styles.menuConnection}>
          <ProductNowConnection placement="inline" />
        </span>
      </div>

      <main className={styles.menuContent}>
        <header className={styles.menuTitle}>
          <p className={styles.menuEyebrow}>A cultivation climb</p>
          <h1>
            Towers <span>of</span> Coreborn
          </h1>
          <p className={styles.menuTagline}>
            Gather Coreborn. Climb floor by floor. Quiet the heart at the
            summit.
          </p>
        </header>

        <nav
          aria-label="Main menu"
          className={styles.menuList}
          onKeyDown={moveMenuFocus}
        >
          {latestSave ? (
            <button
              className={clsx(styles.menuItem, styles.menuItemPrimary)}
              data-menu-item={true}
              onClick={choose(() => onContinue(latestSave))}
              onMouseEnter={() => playSound("hover")}
              ref={firstItem}
              style={{ "--i": 0 } as React.CSSProperties}
              type="button"
            >
              <span className={styles.menuItemLabel}>Continue</span>
              <span className={styles.menuItemDetail}>
                {continueLine} · {formatTimeAgo(latestSave.savedAt, Date.now())}
              </span>
            </button>
          ) : null}
          <button
            className={clsx(
              styles.menuItem,
              !latestSave && styles.menuItemPrimary,
            )}
            data-menu-item={true}
            onClick={choose(onNewClimb)}
            onMouseEnter={() => playSound("hover")}
            ref={latestSave ? undefined : firstItem}
            style={{ "--i": 1 } as React.CSSProperties}
            type="button"
          >
            <span className={styles.menuItemLabel}>
              {profile.totals.climbs === 0 ? "Begin your climb" : "New climb"}
            </span>
            <span className={styles.menuItemDetail}>
              {saveCount > 1
                ? `Choose a tower · ${saveCount} climbs saved`
                : "Choose a tower and ascension"}
            </span>
          </button>
          <button
            className={styles.menuItem}
            data-menu-item={true}
            onClick={choose(onCultivation)}
            onMouseEnter={() => playSound("hover")}
            style={{ "--i": 2 } as React.CSSProperties}
            type="button"
          >
            <span className={styles.menuItemLabel}>
              Cultivation
              {canCultivate ? (
                <span
                  aria-label="An upgrade is ready"
                  className={styles.menuDot}
                  role="img"
                />
              ) : null}
            </span>
            <span className={styles.menuItemDetail}>
              Spend Jade Essence on lasting strength
            </span>
          </button>
          <button
            className={styles.menuItem}
            data-menu-item={true}
            onClick={choose(onChronicle)}
            onMouseEnter={() => playSound("hover")}
            style={{ "--i": 3 } as React.CSSProperties}
            type="button"
          >
            <span className={styles.menuItemLabel}>Chronicle</span>
            <span className={styles.menuItemDetail}>
              Records, Coreborn, and the creatures you have quieted
            </span>
          </button>
          <button
            className={styles.menuItem}
            data-menu-item={true}
            onClick={choose(onSettings)}
            onMouseEnter={() => playSound("hover")}
            style={{ "--i": 4 } as React.CSSProperties}
            type="button"
          >
            <span className={styles.menuItemLabel}>Settings</span>
          </button>
        </nav>
      </main>

      <footer className={styles.menuFooter}>
        <span className={styles.essenceBadge}>
          <Gem size={16} /> {profile.essence} Jade Essence
        </span>
        {profile.totals.climbs > 0 ? (
          <span>
            {profile.totals.climbs}{" "}
            {profile.totals.climbs === 1 ? "climb" : "climbs"} ·{" "}
            {profile.totals.victories}{" "}
            {profile.totals.victories === 1 ? "summit" : "summits"} ·{" "}
            {profile.totals.floorsCleared} floors cleared
          </span>
        ) : (
          <span>Use ↑ ↓ and Enter, or click</span>
        )}
      </footer>
    </div>
  );
};
