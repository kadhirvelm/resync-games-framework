import clsx from "clsx";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { playSound } from "../audio/sound";
import styles from "./shell.module.scss";

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
  /** Room for card grids */
  wide?: boolean;
}

/**
 * A paper card over a dimmed scene. Escape or the backdrop closes it, and
 * focus moves into it when it opens and back when it closes. It renders into
 * the document body so animated or blurred ancestors cannot clip it.
 * @param children - Modal body
 * @param onClose - Closes the modal
 * @param title - Heading, also the dialog's label
 * @param wide - Use the wide card
 * @returns The modal
 */
export const Modal = ({
  children,
  onClose,
  title,
  wide = false,
}: ModalProps) => {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    card.current
      ?.querySelector<HTMLElement>("button, input, [tabindex]")
      ?.focus();
    /**
     * @param event - Key press while the modal is open
     */
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        playSound("back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.modalLayer}>
      <button
        aria-label="Close"
        className={styles.modalBackdrop}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label={title}
        aria-modal="true"
        className={clsx(styles.modalCard, wide && styles.modalWide)}
        ref={card}
        role="dialog"
      >
        <header className={styles.modalHeader}>
          <h2>{title}</h2>
          <button
            aria-label="Close"
            className={styles.modalClose}
            onClick={() => {
              playSound("back");
              onClose();
            }}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
};
