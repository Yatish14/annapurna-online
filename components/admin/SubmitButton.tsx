"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Ask "Are you sure?" with this text before submitting */
  confirm?: string;
  disabled?: boolean;
  title?: string;
};

export default function SubmitButton({ children, className, confirm, disabled, title }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      title={title}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
