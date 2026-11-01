import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "../tower.module.scss";
import { Burst } from "./Burst";

interface ChoiceSlotProps {
  children: ReactNode;
  /** Key of the option being picked right now, if any */
  chosenKey?: string;
  /** This option's key */
  slotKey: string;
}

/**
 * Wraps one option in a pick-one row. While a pick celebrates, the chosen
 * option swells and bursts with light and the others sink away.
 * @param children - The option
 * @param chosenKey - Option being picked, if any
 * @param slotKey - This option's key
 * @returns The wrapped option
 */
export const ChoiceSlot = ({
  children,
  chosenKey,
  slotKey,
}: ChoiceSlotProps) => {
  const isChosen = chosenKey === slotKey;
  return (
    <div
      className={clsx(
        styles.choiceSlot,
        isChosen && styles.choiceChosen,
        chosenKey !== undefined && !isChosen && styles.choiceDismissed,
      )}
    >
      {children}
      {isChosen ? <Burst count={22} reach={190} /> : null}
    </div>
  );
};
