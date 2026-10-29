"use client";

import { useFormStatus } from "react-dom";
import { lock } from "@/lib/viewOnly";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Ask "Are you sure?" with this text before submitting */
  confirm?: string;
  disabled?: boolean;
  title?: string;
  /** Greyed out for a role that can't use it; pressing it shows this message instead (lib/viewOnly.ts) */
  locked?: string | false;
};

export default function SubmitButton({ children, className, confirm, disabled, title, locked }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      title={title}
      {...lock(locked)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
