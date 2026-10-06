"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { focusFirstInvalid } from "./focusFirstInvalid";

/** Indian mobile number: exactly 10 digits, starting with 6, 7, 8 or 9 */
export const MOBILE_PATTERN = /^[6-9]\d{9}$/;

/** Keeps digits only, drops a pasted +91 / 0 prefix, and stops at 10 digits */
export function cleanMobile(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Why a number isn't valid yet, or null when it is (an empty optional field is valid) */
export function mobileProblem(value: string, required: boolean): string | null {
  if (!value) return required ? "Enter your 10-digit mobile number." : null;
  if (!/^[6-9]/.test(value)) return "Mobile numbers start with 6, 7, 8 or 9.";
  if (value.length < 10) return `Enter all 10 digits (${value.length} of 10 typed).`;
  return null;
}

export type MobileInputHandle = {
  /** Shows the error and moves the cursor to the field when the number isn't valid; returns whether it's valid */
  check: () => boolean;
};

type Props = {
  name?: string;
  required?: boolean;
  /** Controlled use (e.g. the print page); leave out inside a plain form */
  value?: string;
  onChange?: (value: string) => void;
  /** Starting number when uncontrolled (e.g. editing a driver) */
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  handle?: React.Ref<MobileInputHandle>;
};

/**
 * Mobile number field used everywhere (sign-in, adding users, print uploads).
 * - Only digits can be typed, 10 at most.
 * - Turns red straight away if the number can't be right (doesn't start with 6–9), and once the
 *   field is left or the form is sent while it's incomplete.
 * - Inside a form, the browser refuses to send it until the number is valid, and the cursor
 *   goes back to this field.
 */
export default function MobileInput({
  name,
  required = false,
  value: controlled,
  onChange,
  defaultValue = "",
  placeholder = "10-digit mobile number",
  autoComplete = "tel-national",
  autoFocus,
  disabled,
  handle,
}: Props) {
  const [own, setOwn] = useState(() => cleanMobile(defaultValue));
  const value = controlled ?? own;
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const messageId = useId();

  const problem = mobileProblem(value, required);
  // A wrong first digit is shown while typing; a short number only after leaving the field or sending
  const wrongStart = Boolean(value) && !/^[6-9]/.test(value);
  const showError = Boolean(problem) && (touched || wrongStart);

  // The browser's own form check uses this, so forms can't be sent with a bad number
  useEffect(() => {
    input.current?.setCustomValidity(problem ?? "");
  }, [problem]);

  useImperativeHandle(handle, () => ({
    check() {
      setTouched(true);
      if (!problem) return true;
      input.current?.focus();
      return false;
    },
  }));

  return (
    <>
      <input
        ref={input}
        type="tel"
        name={name}
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder={placeholder}
        // No maxLength: it would cut a pasted or autofilled "+91 98765 43210" before it's cleaned;
        // cleanMobile() keeps the value to 10 digits instead
        pattern="[6-9][0-9]{9}"
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        className={showError ? "is-invalid" : undefined}
        aria-invalid={showError}
        aria-describedby={messageId}
        onChange={(e) => {
          const next = cleanMobile(e.target.value);
          if (controlled === undefined) setOwn(next);
          onChange?.(next);
        }}
        onBlur={() => value && setTouched(true)}
        onInvalid={(e) => {
          // Show our message instead of the browser's bubble, and put the cursor back here
          e.preventDefault();
          setTouched(true);
          focusFirstInvalid(e.currentTarget);
        }}
      />
      <span id={messageId} className={showError ? "mob-msg is-error" : "mob-msg"} aria-live="polite">
        {showError ? problem : value && value.length < 10 ? `${value.length}/10` : ""}
      </span>
    </>
  );
}
