import { ArrowLeft, Gem } from "lucide-react";
import { useEffect } from "react";
import { playSound } from "../audio/sound";
import styles from "./shell.module.scss";

interface ScreenHeaderProps {
  /** Shown as a badge at the right */
  essence?: number;
  eyebrow?: string;
  onBack: () => void;
  title: string;
}

/**
 * Header for the menu's sub-screens: a back button (also bound to Escape),
 * the title, and the player's essence.
 * @param essence - Essence to show, when relevant
 * @param eyebrow - Small line above the title
 * @param onBack - Returns to the previous screen
 * @param title - Screen title
 * @returns The header
 */
export const ScreenHeader = ({
  essence,
  eyebrow,
  onBack,
  title,
}: ScreenHeaderProps) => {
  useEffect(() => {
    /**
     * @param event - Key press anywhere on the page
     */
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[aria-modal]")) {
        playSound("back");
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <header className={styles.screenHeader}>
      <button
        className={styles.backButton}
        onClick={() => {
          playSound("back");
          onBack();
        }}
        type="button"
      >
        <ArrowLeft size={18} /> Back
      </button>
      <div className={styles.screenHeaderTitle}>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      {essence === undefined ? (
        <span />
      ) : (
        <span className={styles.essenceBadge}>
          <Gem size={16} /> {essence}
        </span>
      )}
    </header>
  );
};
