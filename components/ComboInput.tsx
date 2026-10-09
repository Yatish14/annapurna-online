"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { focusFirstInvalid } from "./focusFirstInvalid";

type Props = {
  id: string;
  /** Form field name: the chosen or typed text is sent as is */
  name: string;
  /** Suggestions shown in the list */
  options: readonly string[];
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  /** Message when the form is sent with nothing chosen or typed */
  requiredMessage?: string;
};

/**
 * A text box with a list of suggestions (same look as the city picker): pick one, or type a name that isn't in the
 * list and it's used as typed. Arrow keys and Enter to choose, Escape to close.
 */
export default function ComboInput({
  id,
  name,
  options,
  required = false,
  maxLength = 60,
  placeholder = "Choose or type",
  requiredMessage = "Choose one or type the name.",
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = `${id}-list`;

  const query = value.trim().toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === query);
  const matches = useMemo(() => {
    if (!query) return [...options];
    const starts = options.filter((o) => o.toLowerCase().startsWith(query));
    const contains = options.filter((o) => !o.toLowerCase().startsWith(query) && o.toLowerCase().includes(query));
    return [...starts, ...contains];
  }, [options, query]);
  // Last row: use what was typed, when it isn't one of the suggestions
  type Row = { kind: "option"; text: string } | { kind: "typed" };
  const rows: Row[] = [...matches.map((text) => ({ kind: "option" as const, text })), ...(query && !exact ? [{ kind: "typed" as const }] : [])];
  const problem = required && !query ? requiredMessage : "";

  useEffect(() => {
    input.current?.setCustomValidity(problem);
  }, [problem]);
  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
  function choose(row: Row) {
    setValue(row.kind === "option" ? row.text : tidy(value));
    setOpen(false);
  }

  return (
    <div className={`xp-combo xp-dd ${open && rows.length ? "is-open" : ""}`}>
      <input
        ref={input}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={maxLength}
        required={required}
        placeholder={placeholder}
        className={touched && problem ? "is-invalid" : undefined}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          if (value) e.currentTarget.select();
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Same as a suggestion in different capitals: use the suggestion's spelling
          setValue(exact ?? tidy(value));
          if (value) setTouched(true);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return setOpen(true);
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + rows.length) % Math.max(rows.length, 1));
          } else if (e.key === "Enter" && open && rows[active]) {
            e.preventDefault();
            choose(rows[active]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        onInvalid={(e) => {
          e.preventDefault();
          setTouched(true);
          focusFirstInvalid(e.currentTarget);
        }}
      />
      {open && rows.length > 0 && (
        <ul ref={list} id={listId} role="listbox" className="xp-combo-list">
          {rows.map((row, i) => (
            <li
              key={row.kind === "option" ? row.text : "typed"}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={`${i === active ? "is-active" : ""} ${row.kind === "typed" ? "is-other" : ""}`}
              // mousedown, so the choice is made before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                choose(row);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {row.kind === "option" ? (
                row.text
              ) : (
                <>
                  Use <b>“{tidy(value)}”</b>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <span className={`mob-msg ${touched && problem ? "is-error" : ""}`} aria-live="polite">
        {touched && problem ? problem : query && !exact && !open ? "Not in the list: it will be saved as typed." : ""}
      </span>
    </div>
  );
}
