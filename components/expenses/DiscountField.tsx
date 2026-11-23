"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/admin/Icon";
import { formatRupees } from "@/lib/expenses/money";

type Props = {
  /** What's typed: rupees, or a percentage of the total when mode is "pct" */
  amount: string;
  mode: string;
  reason: string;
  /** The total typed above (null while empty) */
  total: number | null;
  onChange: (change: { discount_amount?: string; discount_mode?: string; discount_reason?: string }) => void;
};

/** One tap fills these in; anything else can still be typed */
const QUICK = { pct: [5, 10, 15], rs: [200, 500, 1000] } as const;
const REASONS = ["Regular customer", "Festival offer", "Referral", "Long trip"];

/**
 * The booking form's discount: closed it's one "+ Add a discount" button, so a booking without one stays short. Open,
 * it's a card: the amount with a ₹ / % switch built into the box, quick picks, one-tap reasons, and a small bill on
 * the right (total, discount, what the customer pays). The server checks it again (lib/expenses/discountInput.ts).
 */
export default function DiscountField({ amount, mode, reason, total, onChange }: Props) {
  const percent = mode === "pct";
  const typed = Number(amount) > 0 ? Number(amount) : 0;
  // Open when there's a discount already (editing one, or a draft from Annapurna Assist)
  const [open, setOpen] = useState(typed > 0 || Boolean(reason));
  const input = useRef<HTMLInputElement>(null);

  // A server error about the discount opens the card, so the cursor can go to the box
  useEffect(() => {
    if (typed > 0) setOpen(true);
  }, [typed]);

  const off = total === null ? null : percent ? Math.round((total * typed) / 100) : typed;
  const pays = total === null ? null : Math.max(total - (off ?? 0), 0);
  const tooMuch = total !== null && off !== null && off > total;

  function openCard() {
    setOpen(true);
    window.setTimeout(() => input.current?.focus(), 0);
  }
  function remove() {
    onChange({ discount_amount: "", discount_reason: "" });
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="xp-dc-closed">
        {/* Nothing sent: no discount */}
        <button type="button" className="xp-dc-add" onClick={openCard}>
          <Icon name="tag" size={15} /> Add a discount
        </button>
        <span className="ap-muted">Optional: an amount or a % off the total</span>
      </div>
    );
  }

  return (
    <div className="xp-dc" role="group" aria-labelledby="xp-dc-title">
      <input type="hidden" name="discount_mode" value={mode} />
      <div className="xp-dc-main">
        <div className="xp-dc-head">
          <span id="xp-dc-title" className="xp-dc-title">
            <Icon name="tag" size={16} /> Discount
          </span>
          <button type="button" className="xp-dc-remove" onClick={remove}>
            <Icon name="close" size={13} /> Remove
          </button>
        </div>

        {/* The amount, with ₹ / % as part of the box */}
        <div className={`xp-dc-amount ${tooMuch ? "is-invalid" : ""}`}>
          <span className="xp-dc-units" role="radiogroup" aria-label="Discount in">
            {(["rs", "pct"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? "is-on" : ""}
                onClick={() => {
                  onChange({ discount_mode: m, discount_amount: "" });
                  input.current?.focus();
                }}
              >
                {m === "rs" ? "₹" : "%"}
              </button>
            ))}
          </span>
          <input
            ref={input}
            type="number"
            name="discount_amount"
            aria-label={percent ? "Discount (%)" : "Discount (₹)"}
            inputMode="decimal"
            min="0"
            max={percent ? "100" : total !== null ? String(total) : "10000000"}
            step="0.01"
            placeholder={percent ? "e.g. 5" : "e.g. 500"}
            value={amount}
            onChange={(e) => onChange({ discount_amount: e.target.value })}
          />
          <span className="xp-dc-suffix">{percent ? (off ? `= ${formatRupees(off)}` : "% of total") : "off"}</span>
        </div>

        <div className="xp-dc-chips" aria-label="Quick amounts">
          {QUICK[percent ? "pct" : "rs"].map((q) => (
            <button
              key={q}
              type="button"
              className={typed === q ? "is-on" : ""}
              onClick={() => onChange({ discount_amount: String(q) })}
            >
              {percent ? `${q}%` : formatRupees(q)}
            </button>
          ))}
        </div>

        <label className="xp-dc-reason">
          <span>Reason (optional)</span>
          <input
            name="discount_reason"
            maxLength={60}
            autoComplete="off"
            placeholder="Why the discount?"
            value={reason}
            onChange={(e) => onChange({ discount_reason: e.target.value })}
          />
        </label>
        <div className="xp-dc-chips is-reasons" aria-label="Common reasons">
          {REASONS.map((r) => (
            <button key={r} type="button" className={reason === r ? "is-on" : ""} onClick={() => onChange({ discount_reason: reason === r ? "" : r })}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* A small bill: what the discount comes to and what the customer pays */}
      <div className="xp-dc-bill" aria-live="polite">
        <div>
          <span>Total</span>
          <b>{total === null ? "—" : formatRupees(total)}</b>
        </div>
        <div className="is-off">
          <span>Discount{percent && typed ? ` (${typed}%)` : ""}</span>
          <b>{off ? `− ${formatRupees(off)}` : "—"}</b>
        </div>
        <div className="is-pays">
          <span>Customer pays</span>
          <strong>{pays === null ? "—" : formatRupees(pays)}</strong>
        </div>
        <small>
          {total === null ? "Enter the total above to see what they pay." : tooMuch ? "The discount is more than the total." : off ? `They save ${formatRupees(off)}.` : "Pick or type a discount."}
        </small>
      </div>
    </div>
  );
}
