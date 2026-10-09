import Link from "next/link";
import { deleteExpense, recordExpense } from "@/app/admin/expenses/bookings/actions";
import ComboInput from "@/components/ComboInput";
import Dropdown from "@/components/Dropdown";
import Icon, { type IconName } from "@/components/admin/Icon";
import SubmitButton from "@/components/admin/SubmitButton";
import { fmtLong } from "@/lib/dates";
import { formatRupees } from "@/lib/expenses/money";
import { placeText } from "@/lib/expenses/places";
import type { Expense } from "@/lib/expenses/trips";
import PlacePicker from "./PlacePicker";

/** The costs this list handles (EMI and insurance have their own panels) */
export type LedgerKind = "fuel" | "other" | "repair" | "fastag";

type Props = {
  kind: LedgerKind;
  entries: Expense[];
  /** Other expenses: suggested names for the name box (any other name can be typed) */
  names?: readonly string[];
  /**
   * Where a new entry goes: fuel or another expense on a booking (its vehicle), any cost straight to one vehicle,
   * or a vehicle chosen in the form (the Repairs and FASTag pages)
   */
  target: { tripId: number; vehicleId: number } | { vehicleId: number } | { vehicles: { id: number; name: string }[] };
  canManage: boolean;
  /** Adding is off for cancelled bookings */
  canAdd: boolean;
  today: string;
  /** On a vehicle's page: show which booking each fuel entry belongs to */
  showTrip?: boolean;
  /** On the Repairs and FASTag pages: show each entry's vehicle */
  showVehicle?: boolean;
  /** Total of every entry when the list is only one page of them */
  sum?: number;
  /** Heading (defaults to the kind's name) */
  title?: string;
  /** Shown under the list, e.g. page numbers */
  footer?: React.ReactNode;
};

const COPY: Record<LedgerKind, { title: string; icon: IconName; anchor: string; empty: string; add: string; noun: string }> = {
  fuel: { title: "Fuel", icon: "fuel", anchor: "fuel", empty: "No fuel entered yet.", add: "Add fuel", noun: "fuel" },
  other: {
    title: "Other expenses",
    icon: "receipt",
    anchor: "other-expenses",
    empty: "No other expenses yet. Tolls, parking, permits and the like go here.",
    add: "Add expense",
    noun: "expense",
  },
  repair: {
    title: "Repairs & servicing",
    icon: "wrench",
    anchor: "repairs",
    empty: "No repairs entered. Engine oil, tyres, servicing and other work go here.",
    add: "Add repair",
    noun: "repair",
  },
  fastag: {
    title: "FASTag recharges",
    icon: "tag",
    anchor: "fastag",
    empty: "No FASTag recharges entered.",
    add: "Add recharge",
    noun: "FASTag recharge",
  },
};

/** Fuel filled, repairs and servicing, or FASTag recharges: a list plus a form to add one */
export default function Expenses(props: Props) {
  const { kind, entries, target, canManage, canAdd, today, showTrip = false, showVehicle = false, sum, footer, names = [] } = props;
  const copy = COPY[kind];
  const total = sum ?? entries.filter((e) => !e.deleted_ist).reduce((acc, e) => acc + e.amount, 0);
  // Where to come back to after adding or removing
  const from = "tripId" in target ? "trip" : "vehicleId" in target ? "vehicle" : kind === "fastag" ? "fastag" : "repairs";
  const choices = "vehicles" in target ? target.vehicles : null;

  return (
    <section className="ap-panel xp-money" id={copy.anchor}>
      <div className="ap-panel-head">
        <h2>
          <Icon name={copy.icon} size={18} /> {props.title ?? copy.title}
        </h2>
        <span className="xp-total">{formatRupees(total)}</span>
      </div>

      {entries.length === 0 ? (
        <p className="ap-empty-sm">{copy.empty}</p>
      ) : (
        <ul className="xp-ledger">
          {entries.map((e) => (
            <li key={e.id} className={e.deleted_ist ? "is-removed" : ""}>
              <div className="xp-ledger-main">
                <strong>{formatRupees(e.amount)}</strong>
                {kind === "fuel" ? e.litres && <span className="ap-chip">{e.litres} L</span> : e.description && <span className="xp-ledger-what">{e.description}</span>}
                {showVehicle && (
                  <Link href={`/admin/expenses/fleet/${e.vehicle_id}#${copy.anchor}`} className="ap-chip xp-chiplink">
                    {e.vehicle_name}
                  </Link>
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
                {kind === "repair" && (e.shop_name || e.shop_city) && (
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
                    confirm={`Remove this ${formatRupees(e.amount)} ${copy.noun} entry? It will stay in the list, crossed out.`}
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

      {canManage && canAdd && (choices === null || choices.length > 0) && (
        <details className="xp-adder">
          <summary className="ap-btn ap-btn-ghost ap-btn-sm">
            <Icon name="plus" size={14} /> {copy.add}
          </summary>
          <form action={recordExpense} className="xp-adder-form">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="from" value={from} />
            {"vehicleId" in target && <input type="hidden" name="vehicle_id" value={target.vehicleId} />}
            {"tripId" in target && <input type="hidden" name="trip_id" value={target.tripId} />}
            {choices && (
              <label className="ap-field xp-span-2">
                <span>Vehicle</span>
                <Dropdown
                  name="vehicle_id"
                  required
                  placeholder="Select vehicle"
                  requiredMessage="Choose the vehicle."
                  defaultValue={choices.length === 1 ? String(choices[0].id) : undefined}
                  options={choices.map((v) => ({ value: String(v.id), label: v.name }))}
                />
              </label>
            )}
            {kind === "other" && (
              <div className="ap-field xp-span-2">
                <label htmlFor={`${copy.anchor}-name`}>Expense</label>
                <ComboInput
                  id={`${copy.anchor}-name`}
                  name="description"
                  options={names}
                  required
                  maxLength={60}
                  placeholder="Choose or type, e.g. Toll"
                  requiredMessage="Choose the expense or type its name."
                />
              </div>
            )}
            {kind === "repair" && (
              <label className="ap-field xp-span-2">
                <span>What was done</span>
                <input name="description" required minLength={2} maxLength={120} placeholder="e.g. Engine oil change, front tyre, AC gas" />
              </label>
            )}
            <label className="ap-field">
              <span>Amount (₹)</span>
              <input type="number" name="amount" required inputMode="decimal" min="0.01" max="10000000" step="0.01" />
            </label>
            {kind === "fuel" && (
              <label className="ap-field">
                <span>Litres (optional)</span>
                <input type="number" name="litres" inputMode="decimal" min="0.01" max="9999" step="0.01" placeholder="e.g. 35" />
              </label>
            )}
            <label className="ap-field">
              <span>{kind === "fastag" ? "Recharged on" : "Date"}</span>
              <input type="date" name="spent_on" required defaultValue={today} min="2020-01-01" max="2099-12-31" />
            </label>
            {kind === "fastag" && (
              <label className="ap-field">
                <span>FASTag bank or app (optional)</span>
                <input name="description" maxLength={80} placeholder="e.g. Paytm, ICICI FASTag" />
              </label>
            )}
            {kind === "repair" && (
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
              <input
                name="note"
                maxLength={200}
                placeholder={
                  kind === "fuel"
                    ? "e.g. Full tank, Indian Oil Ongole"
                    : kind === "fastag"
                      ? "e.g. Before the Vizag trip"
                      : kind === "other"
                        ? "e.g. Kaza toll plaza, both ways"
                        : "Anything else"
                }
              />
            </label>
            <SubmitButton className="ap-btn ap-btn-gold">
              <Icon name="check" size={15} /> Save {copy.noun}
            </SubmitButton>
          </form>
        </details>
      )}
    </section>
  );
}
