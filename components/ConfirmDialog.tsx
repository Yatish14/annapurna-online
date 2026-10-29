"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon, { type IconName } from "@/components/admin/Icon";

type Props = {
  /** The question, e.g. "Delete Innova?" */
  title: string;
  /** What happens if you go ahead */
  message?: string;
  /** The button that goes ahead, e.g. "Delete" (often the same content as the button that opened this) */
  confirmLabel: React.ReactNode;
  /** The button that closes without doing anything */
  cancelLabel?: string;
  /** Red confirm button, for things that remove or stop something */
  danger?: boolean;
  /** Beside the question; a red cross for danger, a shield otherwise */
  icon?: IconName;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * "Are you sure?" as a small window over the page, instead of the browser's confirm() box.
 * Cancel, Escape or a click outside closes it; the cursor starts on Cancel, so pressing Enter by
 * mistake doesn't delete anything. Same look as the other windows (.xp-modal in admin.css).
 */
export default function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Cancel", danger, icon, onConfirm, onCancel }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // Where the cursor was (the button that opened this), so it goes back there afterwards
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const close = useRef(onCancel);
  useEffect(() => {
    close.current = onCancel;
  });

  // Escape closes; Tab stays inside the window
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // so the chat panel behind doesn't close as well
        close.current();
      } else if (e.key === "Tab" && box.current) {
        const items = Array.from(box.current.querySelectorAll<HTMLElement>("button:not(:disabled)"));
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus();
    };
  }, [opener]);

  return createPortal(
    // A click on the dark area outside the window counts as Cancel
    <div className="xp-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={box}
        className={`xp-modal xp-confirm${danger ? " is-danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? `${titleId}-msg` : undefined}
      >
        <h2 id={titleId}>
          <Icon name={icon ?? (danger ? "xcircle" : "shield")} size={20} /> {title}
        </h2>
        {message && (
          <p id={`${titleId}-msg`} className="xp-modal-note">
            {message}
          </p>
        )}
        <div className="xp-modal-actions">
          <button ref={cancel} type="button" className="ap-btn ap-btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`ap-btn ${danger ? "ap-btn-danger" : "ap-btn-gold"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
