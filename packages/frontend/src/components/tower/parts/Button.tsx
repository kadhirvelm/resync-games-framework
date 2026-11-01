import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import styles from "../tower.module.scss";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "quiet";
}

/**
 * A leaf-cornered button in the game's watercolor style.
 * @param variant - Primary jade fill, or a quiet stone outline
 * @param className - Extra class
 * @param props - Native button props
 * @returns The button
 */
export const Button = ({
  className,
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
    type={type}
    {...props}
  />
);
