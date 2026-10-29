"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import { lock } from "@/lib/viewOnly";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Ask "Are you sure?" with this text before submitting, e.g. "Delete Innova? This can't be undone." */
  confirm?: string;
  /** The popup's button that goes back without doing anything (default "Cancel") */
  cancelLabel?: string;
  disabled?: boolean;
  title?: string;
  /** Greyed out for a role that can't use it; pressing it shows this message instead (lib/viewOnly.ts) */
  locked?: string | false;
};

/** Things that remove or stop something get a red confirm button */
const DANGER = /^(delete|remove|reject|cancel|switch off)\b/i;

/** "Delete Innova? This can't be undone." → the question as the popup's title, the rest under it */
function splitQuestion(text: string) {
  const end = text.indexOf("? ");
  return end === -1 ? { title: text, message: undefined } : { title: text.slice(0, end + 1), message: text.slice(end + 2) };
}

export default function SubmitButton({ children, className, confirm, cancelLabel, disabled, title, locked }: Props) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const question = confirm ? splitQuestion(confirm) : null;

  return (
    <>
      <button
        ref={button}
        type="submit"
        className={className}
        disabled={disabled || pending}
        title={title}
        {...lock(locked)}
        onClick={(e) => {
          if (!confirm) return;
          e.preventDefault(); // not yet: ask first
          setAsking(true);
        }}
      >
        {pending ? "Please wait…" : children}
      </button>
      {asking && question && (
        <ConfirmDialog
          title={question.title}
          message={question.message}
          confirmLabel={children}
          cancelLabel={cancelLabel}
          danger={DANGER.test(confirm ?? "")}
          icon={/^(delete|remove)\b/i.test(confirm ?? "") ? "trash" : undefined}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            // Sends the form as if this button was pressed (so its name and value go too); this doesn't click it again
            const b = button.current;
            b?.form?.requestSubmit(b);
          }}
        />
      )}
    </>
  );
}
