/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { Hourglass } from "lucide-react";
import {
  type CostItem,
  type CostLine,
  type CostStock,
  costItemName,
  isCostItemShort,
} from "./costLine";
import styles from "./costRow.module.scss";

/**
 * @param resource - Priced resource or population
 * @returns Public path to its HUD icon
 */
function costIconSrc(resource: CostItem["resource"]): string {
  return `/descent/resource-icons/${resource}.png`;
}

/**
 * A price drawn the way RTS command cards do: each resource as its icon and
 * a bold amount, with any amount the player cannot cover in red, then the
 * build time. There is no "Need" copy; red amounts say what is missing.
 * @param props - Cost line, the player's stock, and the size to draw at
 * @returns The cost row, or nothing for a free action with no time
 */
export function CostRow({
  line,
  size = "compact",
  stock,
}: {
  line: CostLine;
  /** `compact` fits a command tile; `full` reads in hints and menus. */
  size?: "compact" | "full";
  stock: CostStock;
}) {
  if (
    line.items.length === 0 &&
    line.seconds === undefined &&
    line.count === undefined
  ) {
    return null;
  }
  return (
    <span className={styles.row} data-size={size}>
      {line.count === undefined ? null : (
        <span className={styles.count}>×{line.count}</span>
      )}
      {line.items.map((item) => {
        const short = isCostItemShort(item, stock);
        return (
          <span
            className={styles.item}
            data-resource={item.resource}
            data-short={short}
            key={item.resource}
          >
            {/* biome-ignore lint/performance/noImgElement: bundled game HUD icon */}
            <img
              alt=""
              className={styles.icon}
              src={costIconSrc(item.resource)}
            />
            <span className={styles.amount}>{item.amount}</span>
            <span className={styles.srOnly}>
              {` ${costItemName(item.resource)}${short ? ", not enough" : ""}`}
            </span>
          </span>
        );
      })}
      {line.seconds === undefined ? null : (
        <span className={styles.time}>
          <Hourglass aria-hidden="true" className={styles.timeIcon} />
          <span className={styles.amount}>
            {line.seconds}s{line.secondsEach ? " each" : ""}
          </span>
        </span>
      )}
    </span>
  );
}
