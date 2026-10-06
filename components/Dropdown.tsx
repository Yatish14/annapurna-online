"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { focusFirstInvalid } from "./focusFirstInvalid";

export type DropdownOption = { value: string; label: string };

type Props = {
  /** Form field name (sent with the form through a hidden input) */
  name: string;
  options: DropdownOption[];
  /** Controlled use; leave out inside a plain form */
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  required?: boolean;
  /** Shown when nothing is chosen, e.g. "Select vehicle" */
  placeholder?: string;
  /** Message when the form is sent without a choice */
  requiredMessage?: string;
  /** Optional dropdowns: a first entry that clears the choice, e.g. "No state" */
  emptyLabel?: string;
  /** Typing filters the list. Default: on for lists longer than 7 */
  searchable?: boolean;
  disabled?: boolean;
  id?: string;
};

/**
 * Dropdown in the same style as the city picker (used for every dropdown in the Expense Tracker):
 * a list under the field, arrow keys and Enter to choose, Escape to close, and for longer lists,
 * typing to filter. Inside a form, a required dropdown with nothing chosen stops the form and shows a message.
 */
export default function Dropdown({
  name,
  options: given,
  emptyLabel,
  value: controlled,
  onChange,
  defaultValue = "",
  required = false,
  placeholder = "Select",
  requiredMessage = "Choose one from the list.",
  searchable = given.length > 7,
  disabled = false,
  id: givenId,
}: Props) {
  const options = useMemo(() => (emptyLabel ? [{ value: "", label: emptyLabel }, ...given] : given), [given, emptyLabel]);
  const autoId = useId();
  const id = givenId ?? `${autoId}-dd`;
  const listId = `${id}-list`;
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const selected = value ? options.find((o) => o.value === value) : undefined;
  const [open, setOpen] = useState(false);
  // Text typed to filter (null while not filtering)
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => {
    const q = query?.trim().toLowerCase();
    if (!q) return options;
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(q));
    const contains = options.filter((o) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [options, query]);

  const problem = required && !selected ? requiredMessage : "";
  useEffect(() => {
    input.current?.setCustomValidity(problem);
  }, [problem]);

  // Open on the chosen option
  useEffect(() => {
    if (!open) return;
    const at = shown.findIndex((o) => o.value === value);
    setActive(query ? 0 : Math.max(at, 0));
  }, [open, query]); // eslint-disable-line react-hooks/exhaustive-deps -- only when opening or filtering

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(option: DropdownOption) {
    if (!controlled) setOwn(option.value);
    onChange?.(option.value);
    setQuery(null);
    setOpen(false);
    setTouched(false);
  }

  return (
    <div className={`xp-combo xp-dd ${open ? "is-open" : ""}`}>
      <input type="hidden" name={name} value={value} />
      <input
        ref={input}
        id={id}
        data-for={name}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete={searchable ? "list" : "none"}
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        // Short lists: picked by tapping, so phones don't open the keyboard
        inputMode={searchable ? "text" : "none"}
        className={`${searchable ? "" : "xp-dd-fixed"} ${touched && problem ? "is-invalid" : ""}`}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        value={query ?? selected?.label ?? ""}
        onChange={(e) => {
          if (!searchable) return;
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          if (searchable) e.currentTarget.select();
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Typed a full name exactly: take it; otherwise go back to the chosen option
          const typed = query?.trim().toLowerCase();
          const match = typed ? options.find((o) => o.label.toLowerCase() === typed) : undefined;
          if (match) choose(match);
          setQuery(null);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return setOpen(true);
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + shown.length) % Math.max(shown.length, 1));
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (shown[active]) choose(shown[active]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setQuery(null);
            setOpen(false);
          } else if (!searchable && e.key.length === 1 && /\S/.test(e.key)) {
            // Short lists: a letter jumps to the first option starting with it
            const at = shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
            if (at >= 0) {
              setOpen(true);
              setActive(at);
            }
          }
        }}
        onInvalid={(e) => {
          e.preventDefault();
          setTouched(true);
          focusFirstInvalid(e.currentTarget);
        }}
      />
      {open && (
        <ul ref={list} id={listId} role="listbox" className="xp-combo-list">
          {shown.length === 0 && <li className="xp-combo-note">Nothing matches “{query}”.</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              className={`${i === active ? "is-active" : ""} ${o.value === value ? "is-selected" : ""}`}
              // mousedown, so the choice is made before the field loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              // Inside a <label>, a click would otherwise reopen the list
              onClick={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
      {touched && problem && (
        <span className="mob-msg is-error" aria-live="polite">
          {problem}
        </span>
      )}
    </div>
  );
}
