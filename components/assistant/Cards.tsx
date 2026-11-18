import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/admin/Icon";
import { formatRupees } from "@/lib/expenses/money";
import type { Card } from "@/lib/assistant/types";
import { useAssist, VIEW_ONLY } from "./AssistProvider";

type CardOf<K extends Card["kind"]> = Extract<Card, { kind: K }>;
/** typed: what the admin typed on the card (9.5), sent with Confirm */
export type Typed = { customer_name?: string; customer_phone?: string };
type DraftActions = { onConfirm: (card: CardOf<"draft">, typed?: Typed) => void; onCancel: (card: CardOf<"draft">) => void };

/** One card under a reply, picked by its kind */
export default function CardView({ card, onConfirm, onCancel }: { card: Card } & DraftActions) {
  switch (card.kind) {
    case "bookings":
      return <BookingsCard card={card} />;
    case "stats":
      return <StatsCard card={card} />;
    case "draft":
      return <DraftCard card={card} onConfirm={onConfirm} onCancel={onCancel} />;
    case "file":
      return <FileCard card={card} />;
    case "sources":
      return <SourcesCard card={card} />;
  }
}

function BookingsCard({ card }: { card: CardOf<"bookings"> }) {
  // Privacy-first mode numbers the rows (9.4): the model knows them by these numbers
  const numbered = card.rows.some((r) => r.row);
  return (
    <section className="as-card">
      <header className="as-card-head">
        <strong>{card.title}</strong>
        {card.link && (
          <Link href={card.link.href} className="ap-link">
            {card.link.label} <Icon name="arrow" size={14} />
          </Link>
        )}
      </header>
      <div className="xp-tablewrap">
        <table className="xp-table">
          <thead>
            <tr>
              {numbered && <th>#</th>}
              <th>Booking</th>
              <th className="is-text">Customer</th>
              <th className="is-text">Vehicle · driver</th>
              <th className="is-text">Dates</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((r) => (
              <tr key={r.no}>
                {numbered && <td>{r.row}</td>}
                <th>
                  <Link href={`/admin/expenses/bookings/${r.no}`}>{r.no}</Link>
                </th>
                <td className="is-text">{r.customer}</td>
                <td className="is-text">
                  {r.vehicle} · {r.driver}
                </td>
                <td className="is-text">{r.dates}</td>
                <td className={r.balance > 0 ? "is-neg" : "is-pos"}>{r.balance > 0 ? formatRupees(r.balance) : "Paid"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatsCard({ card }: { card: CardOf<"stats"> }) {
  return (
    <section className="as-card">
      <header className="as-card-head">
        <strong>{card.title}</strong>
      </header>
      <div className="xp-sumtiles as-stats">
        {card.items.map((s) => (
          <div key={s.label} className={`xp-sumtile ${s.tone ? `is-${s.tone}` : ""}`}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

const DRAFT_BADGE = {
  pending: { className: "is-pending", text: "Draft" },
  confirmed: { className: "is-confirmed", text: "Saved" },
  cancelled: { className: "is-cancelled", text: "Cancelled" },
  expired: { className: "is-cancelled", text: "Expired" },
} as const;

/** A booking, payment or fuel entry the assistant prepared. Only the Confirm button saves it. */
function DraftCard({ card, onConfirm, onCancel }: { card: CardOf<"draft"> } & DraftActions) {
  const badge = DRAFT_BADGE[card.status];
  const { canUse, notify } = useAssist();
  /** Viewers: greyed out, but the click still says why */
  const locked = canUse ? {} : { "aria-disabled": true as const };
  // Privacy-first mode (9.5): the customer's name and phone, typed here, go to our server only, never to the AI
  const [typed, setTyped] = useState<Typed>({});
  const asks = card.status === "pending" ? (card.needs ?? []) : [];
  const missing = asks.some((k) => !typed[k]?.trim());
  return (
    <section className={`as-card as-draft is-${card.status}`}>
      <header className="as-card-head">
        <span className="as-draft-title">
          <span className="as-draft-icon">
            <Icon name={card.icon} size={17} />
          </span>
          <strong>{card.title}</strong>
        </span>
        <span className={`ap-badge ${badge.className}`}>{badge.text}</span>
      </header>

      <dl className="as-draft-fields">
        {card.fields.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>

      {asks.length > 0 && (
        <div className="as-draft-typed">
          {asks.includes("customer_name") && (
            <label>
              <span>Customer&apos;s name</span>
              <input
                className="as-draft-input"
                maxLength={80}
                value={typed.customer_name ?? ""}
                onChange={(e) => setTyped((t) => ({ ...t, customer_name: e.target.value }))}
              />
            </label>
          )}
          {asks.includes("customer_phone") && (
            <label>
              <span>Mobile number</span>
              <input
                className="as-draft-input"
                inputMode="numeric"
                maxLength={20}
                value={typed.customer_phone ?? ""}
                onChange={(e) => setTyped((t) => ({ ...t, customer_phone: e.target.value }))}
              />
            </label>
          )}
          <small className="ap-muted">Typed here, these go to this dashboard only, never to the AI.</small>
        </div>
      )}

      {card.warning && card.status === "pending" && <p className="ap-note ap-note-warn">{card.warning}</p>}

      {card.status === "pending" && (
        <div className="as-draft-actions">
          {/* While saving, the buttons wait (the server also saves a draft only once, however often it's pressed) */}
          <button type="button" className="ap-btn ap-btn-gold" onClick={() => onConfirm(card, asks.length ? typed : undefined)} disabled={card.saving || missing} {...locked}>
            <Icon name="check" size={16} /> {card.saving ? "Saving…" : "Confirm"}
          </button>
          <Link
            href={card.formHref}
            className="ap-btn ap-btn-ghost"
            {...locked}
            onClick={(e) => {
              if (canUse) return;
              e.preventDefault(); // viewers stay here and get told why
              notify(VIEW_ONLY.form);
            }}
          >
            <Icon name="edit" size={16} /> {card.formLabel ?? "Open in form"}
          </Link>
          <button type="button" className="ap-btn ap-btn-ghost" onClick={() => onCancel(card)} disabled={card.saving} {...locked}>
            Cancel
          </button>
        </div>
      )}
      {card.status === "confirmed" && (
        <p className="ap-note ap-note-ok as-draft-done">
          <Icon name="check" size={16} /> {card.result}
          {card.resultHref && (
            <>
              {" "}
              <Link href={card.resultHref} className="ap-link">
                Open the booking
              </Link>
            </>
          )}
        </p>
      )}
      {card.status === "cancelled" && <p className="as-draft-done ap-muted">Cancelled. Nothing was saved.</p>}
      {card.status === "expired" && <p className="as-draft-done ap-muted">Expired. Nothing was saved. Ask again for a new draft.</p>}
    </section>
  );
}

function FileCard({ card }: { card: CardOf<"file"> }) {
  return (
    <section className="as-card as-file">
      <span className="as-file-icon">
        <Icon name="file" size={20} />
        <small>PDF</small>
      </span>
      <div className="as-file-main">
        <strong>{card.name}</strong>
        <span>{card.detail}</span>
      </div>
      {card.view && (
        <Link href={card.view} className="ap-link">
          View <Icon name="arrow" size={14} />
        </Link>
      )}
      <a href={card.href} className="ap-btn ap-btn-ghost ap-btn-sm" download>
        <Icon name="download" size={15} /> Download
      </a>
    </section>
  );
}

/** Which help guides an answer came from */
function SourcesCard({ card }: { card: CardOf<"sources"> }) {
  return (
    <div className="as-sources">
      <span>From the help guides</span>
      {card.items.map((s) => (
        <span key={s.title} className="ap-chip" title={s.section}>
          <Icon name="file" size={13} /> {s.title}
        </span>
      ))}
    </div>
  );
}
