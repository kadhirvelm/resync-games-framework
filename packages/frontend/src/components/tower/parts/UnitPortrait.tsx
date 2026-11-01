import clsx from "clsx";
import styles from "../tower.module.scss";

/** Frame size classes. */
const SIZE_CLASSES = {
  large: styles.portraitLarge,
  medium: styles.portraitMedium,
  small: styles.portraitSmall,
};

interface UnitPortraitProps {
  /** Frame and wash color */
  accent: string;
  className?: string;
  /** Painted on the stand-in instead of the name's initial */
  glyph?: string;
  /** Faded, for fallen or locked units */
  muted?: boolean;
  name: string;
  size?: "small" | "medium" | "large";
  url?: string;
}

/**
 * A portrait in a paper frame. Without art, paints a watercolor wash with
 * the unit's initial so missing assets still read as part of the world.
 * @param accent - Frame color
 * @param className - Extra class
 * @param glyph - Stand-in letter. Defaults to the name's initial
 * @param muted - Draw faded
 * @param name - Unit name, used for alt text and the stand-in initial
 * @param size - Frame size. Defaults to medium
 * @param url - Portrait URL, when the asset exists
 * @returns The framed portrait
 */
export const UnitPortrait = ({
  accent,
  className,
  glyph,
  muted = false,
  name,
  size = "medium",
  url,
}: UnitPortraitProps) => (
  <div
    className={clsx(
      styles.portrait,
      SIZE_CLASSES[size],
      muted && styles.portraitFaded,
      className,
    )}
    style={{ "--accent": accent } as React.CSSProperties}
  >
    {url ? (
      // biome-ignore lint/performance/noImgElement: generated art is served by the backend, not the Next image pipeline
      <img alt={name} src={url} />
    ) : (
      <span aria-label={name} className={styles.portraitStandIn} role="img">
        {glyph ?? name.charAt(0).toUpperCase()}
      </span>
    )}
  </div>
);
