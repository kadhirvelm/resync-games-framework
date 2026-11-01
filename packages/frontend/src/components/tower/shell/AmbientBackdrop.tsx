import clsx from "clsx";
import { scatter } from "../parts/particles";
import styles from "./shell.module.scss";

/** Tiers of the silhouette tower, bottom first, as half-widths. */
const TOWER_TIERS = [92, 82, 72, 62, 52, 42, 32];

/** Height of each tower tier in SVG units. */
const TIER_HEIGHT = 74;

/**
 * @param count - How many items
 * @returns Inline custom properties for drifting leaves or motes
 */
function driftStyles(count: number): React.CSSProperties[] {
  return Array.from(
    { length: count },
    (_, index) =>
      ({
        "--delay": `${(-scatter(index, 1) * 24).toFixed(2)}s`,
        "--drift": `${(scatter(index, 2) * 40 - 20).toFixed(1)}vw`,
        "--duration": `${(16 + scatter(index, 3) * 14).toFixed(1)}s`,
        "--size": `${(10 + scatter(index, 4) * 14).toFixed(1)}px`,
        "--spin": `${Math.round(scatter(index, 5) * 720 - 360)}deg`,
        "--x": `${(scatter(index, 6) * 100).toFixed(1)}vw`,
      }) as React.CSSProperties,
  );
}

const LEAVES = driftStyles(16);
const MOTES = driftStyles(34);

/**
 * The silhouette tower: stacked pagoda tiers with lit windows and the
 * glowing core at its summit.
 * @returns SVG group
 */
const TowerSilhouette = () => {
  const centerX = 200;
  const baseY = 780;
  return (
    <svg
      aria-hidden="true"
      className={styles.towerSvg}
      preserveAspectRatio="xMidYMax meet"
      viewBox="0 0 400 800"
    >
      <defs>
        <radialGradient id="core-glow">
          <stop offset="0%" stopColor="#fff6d6" />
          <stop offset="35%" stopColor="#f0d78c" />
          <stop offset="70%" stopColor="rgba(127, 209, 164, 0.35)" />
          <stop offset="100%" stopColor="rgba(127, 209, 164, 0)" />
        </radialGradient>
        <linearGradient id="tower-rim" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#0b1410" />
          <stop offset="70%" stopColor="#13221b" />
          <stop offset="100%" stopColor="#2c4a3b" />
        </linearGradient>
      </defs>
      {TOWER_TIERS.map((half, index) => {
        const top = baseY - (index + 1) * TIER_HEIGHT;
        const body = half - 12;
        const eave = half + 16;
        return (
          <g key={half}>
            <rect
              fill="url(#tower-rim)"
              height={TIER_HEIGHT - 10}
              width={body * 2}
              x={centerX - body}
              y={top + 10}
            />
            <path
              d={`M ${centerX - eave} ${top + 16}
                  Q ${centerX - half} ${top + 6} ${centerX - half + 8} ${top}
                  L ${centerX + half - 8} ${top}
                  Q ${centerX + half} ${top + 6} ${centerX + eave} ${top + 16}
                  L ${centerX + half - 2} ${top + 12}
                  L ${centerX - half + 2} ${top + 12} Z`}
              fill="#0b1410"
            />
            {[-1, 0, 1].map((column) => (
              <rect
                className={styles.towerWindow}
                height={14}
                key={column}
                rx={5}
                style={
                  {
                    "--flicker": `${(2.5 + scatter(index * 3 + column, 7) * 3).toFixed(2)}s`,
                    "--flicker-delay": `${(-scatter(index * 3 + column, 8) * 4).toFixed(2)}s`,
                  } as React.CSSProperties
                }
                width={8}
                x={centerX + column * Math.max(14, body * 0.55) - 4}
                y={top + 34}
              />
            ))}
          </g>
        );
      })}
      <path
        d={`M ${centerX} ${baseY - TOWER_TIERS.length * TIER_HEIGHT - 70} L ${centerX + 7} ${baseY - TOWER_TIERS.length * TIER_HEIGHT} L ${centerX - 7} ${baseY - TOWER_TIERS.length * TIER_HEIGHT} Z`}
        fill="#0b1410"
      />
      <circle
        className={styles.towerCore}
        cx={centerX}
        cy={baseY - TOWER_TIERS.length * TIER_HEIGHT - 84}
        fill="url(#core-glow)"
        r={46}
      />
      <circle
        cx={centerX}
        cy={baseY - TOWER_TIERS.length * TIER_HEIGHT - 84}
        fill="#fff8e1"
        r={7}
      />
    </svg>
  );
};

interface AmbientBackdropProps {
  /** Dusk is the title scene; paper is a quiet wash behind in-game screens */
  variant: "dusk" | "paper";
  /** Hide drifting leaves and motes */
  reducedMotion: boolean;
}

/**
 * Living backdrop: drifting leaves over a paper wash, or the full dusk scene
 * with mountains, mist, fireflies, and the tower glowing on the horizon.
 * Dusk layers drift with the `--px` and `--py` offsets an ancestor sets.
 * Purely decorative and hidden from assistive technology.
 * @param variant - Which scene to paint
 * @param reducedMotion - Leave out moving particles
 * @returns Absolutely positioned layers that fill the parent
 */
export const AmbientBackdrop = ({
  reducedMotion,
  variant,
}: AmbientBackdropProps) => (
  <div
    aria-hidden="true"
    className={clsx(
      styles.ambient,
      variant === "dusk" ? styles.ambientDusk : styles.ambientPaper,
    )}
  >
    {variant === "dusk" ? (
      <>
        <div className={styles.moon} />
        <svg
          aria-hidden="true"
          className={styles.mountainsFar}
          preserveAspectRatio="xMidYMax slice"
          viewBox="0 0 1600 600"
        >
          <path
            d="M0 420 L120 330 L230 380 L380 250 L520 360 L640 300 L780 380 L930 270 L1080 350 L1220 240 L1380 340 L1500 300 L1600 360 L1600 600 L0 600 Z"
            fill="#1e3329"
          />
        </svg>
        <div className={styles.towerWrap}>
          <TowerSilhouette />
        </div>
        <svg
          aria-hidden="true"
          className={styles.mountainsNear}
          preserveAspectRatio="xMidYMax slice"
          viewBox="0 0 1600 600"
        >
          <path
            d="M0 500 C 160 430, 260 470, 360 440 S 560 380, 700 450 S 980 520, 1120 450 S 1400 400, 1600 470 L1600 600 L0 600 Z"
            fill="#0e1813"
          />
        </svg>
        <div className={clsx(styles.mist, styles.mistOne)} />
        <div className={clsx(styles.mist, styles.mistTwo)} />
        {reducedMotion
          ? null
          : MOTES.map((style, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: decorative particles never reorder
              <span className={styles.mote} key={index} style={style} />
            ))}
      </>
    ) : null}
    {reducedMotion
      ? null
      : LEAVES.slice(0, variant === "dusk" ? 16 : 9).map((style, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: decorative particles never reorder
          <span className={styles.leaf} key={index} style={style} />
        ))}
  </div>
);
