import { deletePayment, recordPayment } from "@/app/admin/expenses/bookings/actions";
import Icon from "@/components/admin/Icon";
import SubmitButton from "@/components/admin/SubmitButton";
import Dropdown from "@/components/Dropdown";
import { formatRupees, PAYMENT_METHODS } from "@/lib/expenses/money";
import type { Party, Payment } from "@/lib/expenses/trips";

type Props = {
  party: Party;
  trip: { id: number; trip_no: string; status: "booked" | "cancelled"; driver_name: string };
  payments: Payment[];
  /** Total agreed (customer) or the driver's amount; null when not entered yet */
  due: number | null;
  paid: number;
  canManage: boolean;
  /** "Now" in Indian time, for the date-time field */
  now: string;
};

/** Money received from the customer, or paid to the driver: a timestamped list plus a form to add to it */
export default function Payments({ party, trip, payments, due, paid, canManage, now }: Props) {
  const isDriver = party === "driver";
  const left = due === null ? null : Math.max(due - paid, 0);
  const extra = due !== null && paid > due ? paid - due : 0;
  const percent = due ? Math.min(100, Math.round((paid / due) * 100)) : paid > 0 ? 100 : 0;

  return (
    <section className="ap-panel xp-money" id={isDriver ? "driver-payments" : "customer-payments"}>
      <div className="ap-panel-head">
        <h2>
          <Icon name={isDriver ? "steering" : "rupee"} size={18} /> {isDriver ? `Payments to driver` : "Customer payments"}
        </h2>
        {isDriver && <span className="ap-muted">{trip.driver_name}</span>}
      </div>

      <div className="xp-moneybar">
        <div>
          <span>{isDriver ? "Paid to driver" : "Received"}</span>
          <strong>{formatRupees(paid)}</strong>
        </div>
        <div>
          <span>{isDriver ? "Driver amount" : "Total"}</span>
          <strong>{due === null ? "Not set" : formatRupees(due)}</strong>
        </div>
        <div className={left ? "is-due" : left === 0 ? "is-clear" : ""}>
          <span>{isDriver ? "Still to pay" : "Balance due"}</span>
          <strong>{left === null ? "—" : left === 0 ? (isDriver ? "Settled" : "Fully paid") : formatRupees(left)}</strong>
        </div>
      </div>
      <div className="xp-progress" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </div>
      {due === null && (
        <p className="ap-hint xp-hint-top">
          {isDriver ? "Enter the driver amount" : "Enter the total"} under “Readings and amounts” to see what's left.
        </p>
      )}
      {extra > 0 && (
        <p className="ap-note ap-note-warn">
          {isDriver ? "Paid" : "Received"} {formatRupees(extra)} more than {isDriver ? "the driver amount" : "the total"}.
        </p>
      )}

      {payments.length === 0 ? (
        <p className="ap-empty-sm">{isDriver ? "Nothing paid to the driver yet." : "No payments received yet."}</p>
      ) : (
        <ul className="xp-ledger">
          {payments.map((p) => (
            <li key={p.id} className={p.deleted_ist ? "is-removed" : ""}>
              <div className="xp-ledger-main">
                <strong>{formatRupees(p.amount)}</strong>
                <span className="ap-chip">{PAYMENT_METHODS[p.method]}</span>
                {p.note && <span className="xp-ledger-note">{p.note}</span>}
              </div>
              <div className="xp-ledger-meta">
                <span>
                  <Icon name="clock" size={13} /> {isDriver ? "Paid" : "Received"} {p.paid_ist}
                </span>
                <span>
                  Recorded by <b>{p.created_by ?? "—"}</b>
                  {p.late_entry ? ` on ${p.created_ist}` : ""}
                </span>
                {p.deleted_ist && (
                  <span className="xp-removed">
                    Removed by <b>{p.deleted_by ?? "—"}</b> · {p.deleted_ist}
                  </span>
                )}
              </div>
              {canManage && !p.deleted_ist && (
                <form action={deletePayment}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="trip_no" value={trip.trip_no} />
                  <SubmitButton
                    className="ap-btn ap-btn-ghost ap-btn-sm xp-remove"
                    title="Remove this payment (entered by mistake)"
                    confirm={`Remove the ${formatRupees(p.amount)} payment from ${p.paid_ist}? It will stay in the list, crossed out.`}
                  >
                    <Icon name="trash" size={13} />
                    <span className="sr-only">Remove</span>
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && trip.status === "booked" && (
        <details className="xp-adder">
          <summary className="ap-btn ap-btn-ghost ap-btn-sm">
            <Icon name="plus" size={14} /> {isDriver ? "Record payment to driver" : "Record customer payment"}
          </summary>
          <form action={recordPayment} className="xp-adder-form">
            <input type="hidden" name="trip_id" value={trip.id} />
            <input type="hidden" name="party" value={party} />
            <label className="ap-field">
              <span>Amount (₹)</span>
              <input
                type="number"
                name="amount"
                required
                inputMode="decimal"
                min="0.01"
                max="10000000"
                step="0.01"
                defaultValue={left ? String(left) : undefined}
              />
            </label>
            <label className="ap-field">
              <span>Paid by</span>
              <Dropdown
                name="method"
                defaultValue="cash"
                options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))}
              />
            </label>
            <label className="ap-field">
              <span>When</span>
              <input type="datetime-local" name="paid_at" required defaultValue={now} max={now.slice(0, 10) + "T23:59"} />
            </label>
            <label className="ap-field">
              <span>Note (optional)</span>
              <input name="note" maxLength={120} placeholder={isDriver ? "e.g. Batta for 2 days" : "e.g. Final payment"} />
            </label>
            <SubmitButton className="ap-btn ap-btn-gold">
              <Icon name="check" size={15} /> Save payment
            </SubmitButton>
          </form>
        </details>
      )}
    </section>
  );
}
