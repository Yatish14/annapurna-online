"use client";

import { useState } from "react";
import Icon from "@/components/admin/Icon";
import MobileInput from "@/components/MobileInput";

type Field = { name: string; label: string; value: string; kind?: "text" | "mobile" };

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  /** Record being edited (sent as "id") */
  id: number;
  /** Fields edited in place: the first replaces the title; a mobile number goes next to it */
  fields: Field[];
  action: (fd: FormData) => Promise<void>;
  canEdit: boolean;
  editLabel: string;
  /** Right-hand side: status, buttons */
  children?: React.ReactNode;
};

/**
 * Page header for a vehicle's or driver's page. The ✎ button turns the name (and mobile number) into
 * text fields right where they are shown; ✓ saves, ✕ or Escape cancels.
 */
export default function EditableHeader({ eyebrow, title, subtitle, id, fields, action, canEdit, editLabel, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(fd: FormData) {
    setSaving(true);
    try {
      await action(fd); // redirects back to this page with a message
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  return (
    <header className="xp-editablehead">
      <span className="ap-eyebrow">{eyebrow}</span>
      {/* Name (or its edit fields) with the status and buttons on the same line */}
      <div className={`xp-headrow ${editing ? "is-editing" : ""}`}>
        {editing ? (
          <form
            action={save}
            className="xp-inlineform"
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          >
            <input type="hidden" name="id" value={id} />
            {fields.map((f, i) =>
              f.kind === "mobile" ? (
                <label key={f.name} className="ap-field xp-inlinefield">
                  <span className="sr-only">{f.label}</span>
                  <MobileInput name={f.name} required autoComplete="off" defaultValue={f.value} />
                </label>
              ) : (
                <input
                  key={f.name}
                  name={f.name}
                  className={i === 0 ? "xp-titleinput" : "xp-inlineinput"}
                  aria-label={f.label}
                  defaultValue={f.value}
                  required
                  minLength={2}
                  maxLength={60}
                  autoFocus={i === 0}
                  autoComplete="off"
                />
              ),
            )}
            <span className="xp-inlinebtns">
              <button type="submit" className="xp-roundbtn is-ok" aria-label="Save" title="Save" disabled={saving}>
                {saving ? <span className="ap-link-spinner" aria-hidden="true" /> : <Icon name="check" size={18} />}
              </button>
              <button type="button" className="xp-roundbtn" aria-label="Cancel" title="Cancel (Esc)" onClick={() => setEditing(false)}>
                <Icon name="close" size={16} />
              </button>
            </span>
          </form>
        ) : (
          <div className="xp-titlerow">
            <h1>{title}</h1>
            {canEdit && (
              <button type="button" className="xp-roundbtn xp-editbtn" aria-label={editLabel} title={editLabel} onClick={() => setEditing(true)}>
                <Icon name="edit" size={16} />
              </button>
            )}
          </div>
        )}
        {children && <div className="xp-headside">{children}</div>}
      </div>
      {!editing && subtitle && <p className="xp-headsub">{subtitle}</p>}
    </header>
  );
}
