import clsx from "clsx";
import styles from "../tower.module.scss";

interface LeafIconProps {
  className?: string;
  /** Whether the leaf is painted in or only outlined */
  filled?: boolean;
  /** Number drawn on the leaf, such as an Aether cost */
  label?: string | number;
  size?: number;
}

/**
 * The game's leaf mark: Aether costs, tier pips, and decoration.
 * It is hidden from screen readers; callers put any meaning in nearby text.
 * @param className - Extra class for color or placement
 * @param filled - Paint the leaf in. Defaults to true
 * @param label - Optional number or letter on the leaf
 * @param size - Width and height in pixels. Defaults to 24
 * @returns An inline SVG leaf
 */
export const LeafIcon = ({
  className,
  filled = true,
  label,
  size = 24,
}: LeafIconProps) => (
  <svg
    aria-hidden="true"
    className={clsx(
      styles.leafIcon,
      filled ? styles.leafFilled : styles.leafEmpty,
      className,
    )}
    height={size}
    viewBox="0 0 32 32"
    width={size}
  >
    <path d="M4 28 C 4 12, 14 4, 28 4 C 28 18, 20 28, 4 28 Z" />
    <path className={styles.leafVein} d="M5 27 L 22 10" />
    {label === undefined ? null : (
      <text className={styles.leafLabel} x="16.5" y="21">
        {label}
      </text>
    )}
  </svg>
);
