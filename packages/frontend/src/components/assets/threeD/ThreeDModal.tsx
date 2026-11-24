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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();

    /** Closes the modal when the user clicks on its backdrop outside the box. */
    const handleBackdropClick = (event: MouseEvent) => {
      if (dialog === null || event.target !== dialog) {
        return;
      }
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
      if (clickedOutside) {
        onCloseRef.current();
      }
    };

    dialog?.addEventListener("click", handleBackdropClick);
    return () => {
      dialog?.removeEventListener("click", handleBackdropClick);
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
