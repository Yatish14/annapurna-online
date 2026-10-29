"use client";

import { useEffect, useRef, useState } from "react";
import { resetPasswordAction } from "@/app/admin/users/actions";
import Icon from "@/components/admin/Icon";
import SubmitButton from "@/components/admin/SubmitButton";
import { lock } from "@/lib/viewOnly";

type Props = {
  userId: number;
  name: string;
  showReset: boolean;
  /** Set for roles that can't reset passwords: the button shows greyed out and says why */
  resetLocked?: string | false;
  /** The Remove button (a server form), shown next to Reset password */
  children?: React.ReactNode;
};

/**
 * A user's buttons on the Users page. "Reset password" opens a small panel across the row (below the
 * buttons) with the new password, Show, Save and Cancel; Cancel or Esc closes it.
 */
export default function UserActions({ userId, name, showReset, resetLocked, children }: Props) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="ap-user-actions">
        {showReset && (
          <button
            type="button"
            className={`ap-btn ap-btn-ghost ap-btn-sm${open ? " is-on" : ""}`}
            aria-expanded={open}
            aria-controls={`reset-${userId}`}
            onClick={() => setOpen((o) => !o)}
            {...lock(resetLocked)}
          >
            <Icon name="key" size={14} /> Reset password
          </button>
        )}
        {children}
      </div>

      {showReset && open && (
        <form id={`reset-${userId}`} action={resetPasswordAction} className="ap-reset-panel">
          <input type="hidden" name="id" value={userId} />
          <label className="ap-field">
            <span>New password for {name}</span>
            <span className="ap-reset-box">
              <input
                ref={input}
                type={shown ? "text" : "password"}
                name="password"
                minLength={8}
                required
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <button type="button" className="ap-reset-show" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
                <Icon name="eye" size={15} /> {shown ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          <div className="ap-reset-buttons">
            <SubmitButton className="ap-btn ap-btn-gold ap-btn-sm">
              <Icon name="check" size={14} /> Save password
            </SubmitButton>
            <button type="button" className="ap-btn ap-btn-ghost ap-btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="ap-hint">Share it with {name.split(" ")[0]} privately. They use it the next time they sign in.</p>
        </form>
      )}
    </>
  );
}
