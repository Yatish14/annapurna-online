import Link from "next/link";
import { deleteExpense, recordExpense } from "@/app/admin/expenses/bookings/actions";
import Icon from "@/components/admin/Icon";
import SubmitButton from "@/components/admin/SubmitButton";
import { fmtLong } from "@/lib/dates";
import { formatRupees } from "@/lib/expenses/money";
import { placeText } from "@/lib/expenses/places";
import type { Expense, ExpenseKind } from "@/lib/expenses/trips";
import PlacePicker from "./PlacePicker";

type Props = {
  kind: ExpenseKind;
  entries: Expense[];
  /** Add to a booking (its vehicle) or straight to a vehicle */
  target: { tripId: number; vehicleId: number } | { vehicleId: number };
  canManage: boolean;
  /** Adding is off for cancelled bookings */
  canAdd: boolean;
  today: string;
  /** On a vehicle's page: show which booking each entry belongs to */
  showTrip?: boolean;
  /** Total of every entry when the list is only one page of them */
  sum?: number;
  /** Shown under the list, e.g. page numbers */
  footer?: React.ReactNode;
};

/** Fuel filled, or repairs and servicing: a list plus a form to add one */
export default function Expenses({ kind, entries, target, canManage, canAdd, today, showTrip = false, sum, footer }: Props) {
  const isFuel = kind === "fuel";
  const total = sum ?? entries.filter((e) => !e.deleted_ist).reduce((acc, e) => acc + e.amount, 0);
  const from = "tripId" in target ? "trip" : "vehicle";

  return (
    <section className="ap-panel xp-money" id={isFuel ? "fuel" : "repairs"}>
      <div className="ap-panel-head">
        <h2>
          <Icon name={isFuel ? "fuel" : "wrench"} size={18} /> {isFuel ? "Fuel" : "Repairs & servicing"}
        </h2>
        <span className="xp-total">{formatRupees(total)}</span>
      </div>

      {entries.length === 0 ? (
        <p className="ap-empty-sm">
          {isFuel ? "No fuel entered yet." : "No repairs entered. Engine oil, tyres, servicing and other work go here."}
        </p>
      ) : (
        <ul className="xp-ledger">
          {entries.map((e) => (
            <li key={e.id} className={e.deleted_ist ? "is-removed" : ""}>
              <div className="xp-ledger-main">
                <strong>{formatRupees(e.amount)}</strong>
                {isFuel ? (
                  e.litres && <span className="ap-chip">{e.litres} L</span>
                ) : (
                  <span className="xp-ledger-what">{e.description}</span>
                )}
                {showTrip && e.trip_no && (
                  <Link href={`/admin/expenses/bookings/${e.trip_no}`} className="ap-chip xp-chiplink">
                    {e.trip_no}
                  </Link>
                )}
              </div>
              <div className="xp-ledger-meta">
                <span>
                  <Icon name="calendar" size={13} /> {fmtLong(e.spent_on)}
                </span>
                {!isFuel && (e.shop_name || e.shop_city) && (
                  <span>
                    <Icon name="pin" size={13} /> {[e.shop_name, placeText(e.shop_city, e.shop_state)].filter(Boolean).join(", ")}
                  </span>
                )}
                {e.note && <span className="xp-ledger-note">{e.note}</span>}
                <span>
                  Added by <b>{e.created_by ?? "—"}</b> · {e.created_ist}
                </span>
                {e.deleted_ist && (
                  <span className="xp-removed">
                    Removed by <b>{e.deleted_by ?? "—"}</b> · {e.deleted_ist}
                  </span>
                )}
              </div>
              {canManage && !e.deleted_ist && (
                <form action={deleteExpense}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="from" value={from} />
                  <SubmitButton
                    className="ap-btn ap-btn-ghost ap-btn-sm xp-remove"
                    title="Remove this entry (entered by mistake)"
                    confirm={`Remove this ${formatRupees(e.amount)} ${isFuel ? "fuel" : "repair"} entry? It will stay in the list, crossed out.`}
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
      {footer}

      {canManage && canAdd && (
        <details className="xp-adder">
          <summary className="ap-btn ap-btn-ghost ap-btn-sm">
            <Icon name="plus" size={14} /> {isFuel ? "Add fuel" : "Add repair"}
          </summary>
          <form action={recordExpense} className="xp-adder-form">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="vehicle_id" value={target.vehicleId} />
            {"tripId" in target && <input type="hidden" name="trip_id" value={target.tripId} />}
            {!isFuel && (
              <label className="ap-field xp-span-2">
                <span>What was done</span>
                <input name="description" required minLength={2} maxLength={120} placeholder="e.g. Engine oil change, front tyre, AC gas" />
              </label>
            )}
            <label className="ap-field">
              <span>Amount (₹)</span>
              <input type="number" name="amount" required inputMode="decimal" min="0.01" max="10000000" step="0.01" />
            </label>
            {isFuel && (
              <label className="ap-field">
                <span>Litres (optional)</span>
                <input type="number" name="litres" inputMode="decimal" min="0.01" max="9999" step="0.01" placeholder="e.g. 35" />
              </label>
            )}
            <label className="ap-field">
              <span>Date</span>
              <input type="date" name="spent_on" required defaultValue={today} min="2020-01-01" max="2099-12-31" />
            </label>
            {!isFuel && (
              <>
                <label className="ap-field xp-span-2">
                  <span>Showroom or shop name (optional)</span>
                  <input name="shop_name" maxLength={80} placeholder="e.g. Sai Motors" />
                </label>
                <div className="xp-span-2">
                  <PlacePicker label="Shop" stateName="shop_state" cityName="shop_city" />
                </div>
              </>
            )}
            <label className="ap-field xp-span-2">
              <span>Note (optional)</span>
              <input name="note" maxLength={200} placeholder={isFuel ? "e.g. Full tank, Indian Oil Ongole" : "Anything else"} />
            </label>
            <SubmitButton className="ap-btn ap-btn-gold">
              <Icon name="check" size={15} /> Save {isFuel ? "fuel" : "repair"}
            </SubmitButton>
          </form>
        </details>
      )}
    </section>
  );
}
