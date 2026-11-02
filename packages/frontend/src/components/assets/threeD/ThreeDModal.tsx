import { type ReactNode, useEffect, useRef } from "react";
import styles from "./threeDWorkshop.module.scss";

/**
 * Native modal with focus containment, Escape handling, and focus restoration.
 * @param children - Preview or editor content
 * @param title - Accessible dialog title
 * @param onClose - Closes the authoring surface
 * @returns A browser-managed modal dialog
 */
export function ThreeDModal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      aria-label={title}
      className={styles.previewDialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={ref}
    >
      <div className={styles.heading}>
        <h2>{title}</h2>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
