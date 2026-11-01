import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { playSound } from "../audio/sound";
import styles from "../tower.module.scss";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "quiet";
}

/**
 * A leaf-cornered button in the game's watercolor style. It chimes softly
 * under the pointer, catches a glint of light, and squashes when pressed.
 * @param variant - Primary jade fill, or a quiet stone outline
 * @param className - Extra class
 * @param props - Native button props
 * @returns The button
 */
export const Button = ({
  className,
  onMouseEnter,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) => (
  <button
    className={clsx(
      styles.button,
      variant === "quiet" && styles.buttonQuiet,
      className,
    )}
    onMouseEnter={(event) => {
      if (!props.disabled) {
        playSound("hover");
      }
      onMouseEnter?.(event);
    }}
    type={type}
    {...props}
  />
);
