import { payEmiAction, saveEmiAction, saveInsuranceAction } from "@/app/admin/expenses/fleet/actions";
import { deleteExpense } from "@/app/admin/expenses/bookings/actions";
import Icon from "@/components/admin/Icon";
import SubmitButton from "@/components/admin/SubmitButton";
import { addDays, fmtLong, todayIST } from "@/lib/dates";
import { emiStatus, insuranceStatus, monthText, type VehicleFinance } from "@/lib/expenses/finance";
import { formatRupees } from "@/lib/expenses/money";
import type { Expense } from "@/lib/expenses/trips";

type Props = {
  finance: VehicleFinance;
  emiEntries: Expense[];
  insuranceEntries: Expense[];
  canManage: boolean;
  /** Page numbers under each list */
  emiFooter?: React.ReactNode;
  insuranceFooter?: React.ReactNode;
};

/** A year after a date, minus a day: a policy from 1 Oct 2026 runs to 30 Sep 2027 */
function yearLater(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return addDays(d.toISOString().slice(0, 10), -1);
}

/** Payments list (EMIs or premiums), with removing for mistakes */
function PaidList({ entries, canManage, label }: { entries: Expense[]; canManage: boolean; label: (e: Expense) => React.ReactNode }) {
  return (
    <ul className="xp-ledger">
      {entries.map((e) => (
        <li key={e.id} className={e.deleted_ist ? "is-removed" : ""}>
          <div className="xp-ledger-main">
            <strong>{formatRupees(e.amount)}</strong>
            {label(e)}
          </div>
          <div className="xp-ledger-meta">
            <span>
              <Icon name="calendar" size={13} /> Paid {fmtLong(e.spent_on)}
            </span>
            {e.note && <span className="xp-ledger-note">{e.note}</span>}
            <span>
              Recorded by <b>{e.created_by ?? "—"}</b> · {e.created_ist}
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
              <input type="hidden" name="from" value="vehicle" />
              <SubmitButton
                className="ap-btn ap-btn-ghost ap-btn-sm xp-remove"
                title="Remove this payment (entered by mistake)"
                confirm={`Remove this ${formatRupees(e.amount)} payment? It will stay in the list, crossed out.`}
              >
                <Icon name="trash" size={13} />
                <span className="sr-only">Remove</span>
              </SubmitButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

function EmiForm({ f, submitLabel }: { f: VehicleFinance; submitLabel: string }) {
  return (
    <form action={saveEmiAction} className="xp-adder-form">
      <input type="hidden" name="id" value={f.id} />
      <label className="ap-field">
        <span>Bank or finance company</span>
        <input name="lender" required minLength={2} maxLength={80} defaultValue={f.emi_lender ?? ""} placeholder="e.g. HDFC Bank" />
      </label>
      <label className="ap-field">
        <span>EMI per month (₹)</span>
        <input type="number" name="amount" required inputMode="decimal" min="1" max="10000000" step="0.01" defaultValue={f.emi_amount ?? ""} />
      </label>
      <label className="ap-field">
        <span>Due on day of the month</span>
        <input type="number" name="day" required inputMode="numeric" min="1" max="31" step="1" defaultValue={f.emi_day ?? 5} />
      </label>
      <label className="ap-field">
        <span>First EMI month</span>
        <input type="month" name="start" required min="2000-01" max="2099-12" defaultValue={f.emi_start ?? todayIST().slice(0, 7)} />
      </label>
      <label className="ap-field">
        <span>Last EMI month</span>
        <input type="month" name="end" required min="2000-01" max="2099-12" defaultValue={f.emi_end ?? ""} />
      </label>
      <SubmitButton className="ap-btn ap-btn-gold">
        <Icon name="check" size={15} /> {submitLabel}
      </SubmitButton>
    </form>
  );
}

function InsuranceForm({ f, renew }: { f: VehicleFinance; renew: boolean }) {
  const today = todayIST();
  const from = renew && f.insurance_to ? addDays(f.insurance_to, 1) : (f.insurance_from ?? "");
  const to = renew && from ? yearLater(from) : (f.insurance_to ?? "");
  return (
    <form action={saveInsuranceAction} className="xp-adder-form">
      <input type="hidden" name="id" value={f.id} />
      <label className="ap-field">
        <span>Insurance company</span>
        <input name="company" required minLength={2} maxLength={80} defaultValue={f.insurance_company ?? ""} placeholder="e.g. ICICI Lombard" />
      </label>
      <label className="ap-field">
        <span>Policy number (optional)</span>
        <input name="policy" maxLength={60} defaultValue={renew ? "" : (f.insurance_policy ?? "")} placeholder={renew ? "New policy number" : ""} />
      </label>
      <label className="ap-field">
        <span>Premium (₹)</span>
        <input type="number" name="premium" required inputMode="decimal" min="1" max="10000000" step="0.01" defaultValue={f.insurance_premium ?? ""} />
      </label>
      <label className="ap-field">
        <span>Valid from</span>
        <input type="date" name="from" required min="2000-01-01" max="2099-12-31" defaultValue={from} />
      </label>
      <label className="ap-field">
        <span>Valid to</span>
        <input type="date" name="to" required min="2000-01-01" max="2099-12-31" defaultValue={to} />
      </label>
      {renew ? (
        <>
          <input type="hidden" name="record_payment" value="1" />
          <label className="ap-field">
            <span>Premium paid on</span>
            <input type="date" name="paid_on" required max={today} defaultValue={today} />
          </label>
        </>
      ) : (
        <label className="ap-field xp-span-2 xp-check">
          <input type="checkbox" name="record_payment" value="1" />
          <span>Also add the premium to this vehicle&apos;s costs, paid on</span>
          <input type="date" name="paid_on" max={today} defaultValue={today} aria-label="Premium paid on" />
        </label>
      )}
      <SubmitButton className="ap-btn ap-btn-gold">
        <Icon name="check" size={15} /> {renew ? "Save renewal" : "Save insurance"}
      </SubmitButton>
    </form>
  );
}

export default function VehicleFinancePanels({ finance: f, emiEntries, insuranceEntries, canManage, emiFooter, insuranceFooter }: Props) {
  const today = todayIST();
  const emi = emiStatus(f, today);
  const ins = insuranceStatus(f, today);

  const emiChip =
    emi.state === "none"
      ? null
      : emi.state === "paid"
        ? { cls: "is-free", text: `${monthText(emi.month)} paid` }
        : emi.state === "due"
          ? { cls: "is-out", text: `Due ${fmtLong(emi.due!)}` }
          : emi.state === "overdue"
            ? { cls: "is-late", text: `Overdue since ${fmtLong(emi.due!)}` }
            : emi.state === "not-started"
              ? { cls: "is-off", text: `Starts ${monthText(emi.month)}` }
              : { cls: "is-off", text: "Loan completed" };
  const insChip =
    ins.state === "none"
      ? null
      : ins.state === "valid"
        ? { cls: "is-free", text: `Valid till ${fmtLong(f.insurance_to!)}` }
        : ins.state === "soon"
          ? { cls: "is-out", text: ins.daysLeft === 0 ? "Expires today" : `Expires in ${ins.daysLeft} day${ins.daysLeft === 1 ? "" : "s"}` }
          : { cls: "is-late", text: `Expired ${fmtLong(f.insurance_to!)}` };

  return (
    <div className="xp-detail">
      <section className="ap-panel xp-money" id="emi">
        <div className="ap-panel-head">
          <h2>
            <Icon name="wallet" size={18} /> Loan / EMI
          </h2>
          {emiChip && <span className={`xp-state ${emiChip.cls}`}>{emiChip.text}</span>}
        </div>

        {emi.state === "none" ? (
          <p className="ap-empty-sm">No loan on this vehicle. If it was bought on EMI, add the loan details to track each month&apos;s EMI.</p>
        ) : (
          <>
            <div className="xp-moneybar">
              <div>
                <span>EMI</span>
                <strong>{formatRupees(f.emi_amount!)}</strong>
              </div>
              <div>
                <span>Paid</span>
                <strong>
                  {emi.paid} of {emi.months}
                </strong>
              </div>
              <div className={emi.left ? "" : "is-clear"}>
                <span>Still to pay</span>
                <strong>{emi.left ? formatRupees(emi.remaining) : "Nothing"}</strong>
              </div>
            </div>
            <div className="xp-progress" aria-hidden="true">
              <i style={{ width: `${Math.round((emi.paid / emi.months) * 100)}%` }} />
            </div>
            <p className="xp-meta xp-finance-line">
              <b>{f.emi_lender}</b> · due on day {f.emi_day} · {monthText(f.emi_start!)} to {monthText(f.emi_end!)} ·{" "}
              {emi.left} EMI{emi.left === 1 ? "" : "s"} left · {formatRupees(f.emi_paid_total)} paid so far
            </p>
          </>
        )}

        {emiEntries.length > 0 && (
          <PaidList
            entries={emiEntries}
            canManage={canManage}
            label={(e) => <span className="ap-chip">For {e.period ? monthText(e.period) : "—"}</span>}
          />
        )}
        {emiFooter}

        {canManage && (
          <div className="xp-adders">
            {emi.state !== "none" && emi.state !== "finished" && (
              <details className="xp-adder">
                <summary className="ap-btn ap-btn-gold ap-btn-sm">
                  <Icon name="check" size={14} /> Mark EMI paid
                </summary>
                <form action={payEmiAction} className="xp-adder-form">
                  <input type="hidden" name="id" value={f.id} />
                  <label className="ap-field">
                    <span>EMI for the month</span>
                    <input type="month" name="month" required min={f.emi_start!} max={f.emi_end!} defaultValue={emi.nextMonth} />
                  </label>
                  <label className="ap-field">
                    <span>Amount (₹)</span>
                    <input type="number" name="amount" required inputMode="decimal" min="1" max="10000000" step="0.01" defaultValue={f.emi_amount!} />
                  </label>
                  <label className="ap-field">
                    <span>Paid on</span>
                    <input type="date" name="paid_on" required max={today} defaultValue={today} />
                  </label>
                  <label className="ap-field">
                    <span>Note (optional)</span>
                    <input name="note" maxLength={200} placeholder="e.g. Includes ₹500 late fee" />
                  </label>
                  <SubmitButton className="ap-btn ap-btn-gold">
                    <Icon name="check" size={15} /> Save EMI payment
                  </SubmitButton>
                </form>
              </details>
            )}
            <details className="xp-adder">
              <summary className="ap-btn ap-btn-ghost ap-btn-sm">
                <Icon name={emi.state === "none" ? "plus" : "edit"} size={14} /> {emi.state === "none" ? "Add loan details" : "Edit loan details"}
              </summary>
              <EmiForm f={f} submitLabel={emi.state === "none" ? "Save loan details" : "Save changes"} />
              {emi.state !== "none" && (
                <form action={saveEmiAction} className="xp-remove-details">
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="action" value="remove" />
                  <SubmitButton
                    className="ap-btn ap-btn-danger ap-btn-sm"
                    confirm="Remove the loan details? EMI payments already recorded are kept."
                  >
                    <Icon name="trash" size={13} /> Remove loan details
                  </SubmitButton>
                </form>
              )}
            </details>
          </div>
        )}
      </section>

      <section className="ap-panel xp-money" id="insurance">
        <div className="ap-panel-head">
          <h2>
            <Icon name="shield" size={18} /> Insurance
          </h2>
          {insChip && <span className={`xp-state ${insChip.cls}`}>{insChip.text}</span>}
        </div>

        {ins.state === "none" ? (
          <p className="ap-empty-sm">No insurance details yet. Add the policy to get a reminder before it expires.</p>
        ) : (
          <>
            <div className="xp-moneybar">
              <div>
                <span>Premium</span>
                <strong>{formatRupees(f.insurance_premium!)}</strong>
              </div>
              <div>
                <span>Valid from</span>
                <strong>{fmtLong(f.insurance_from!)}</strong>
              </div>
              <div className={ins.state === "expired" ? "is-due" : ins.state === "soon" ? "is-soon" : "is-clear"}>
                <span>Valid to</span>
                <strong>{fmtLong(f.insurance_to!)}</strong>
              </div>
            </div>
            <p className="xp-meta xp-finance-line">
              <b>{f.insurance_company}</b>
              {f.insurance_policy ? ` · Policy ${f.insurance_policy}` : ""} · {formatRupees(f.insurance_paid_total)} paid in premiums so far
            </p>
          </>
        )}

        {insuranceEntries.length > 0 && (
          <PaidList
            entries={insuranceEntries}
            canManage={canManage}
            label={(e) => <span className="xp-ledger-what">{e.description}</span>}
          />
        )}
        {insuranceFooter}

        {canManage && (
          <div className="xp-adders">
            {ins.state !== "none" && (
              <details className="xp-adder">
                <summary className="ap-btn ap-btn-gold ap-btn-sm">
                  <Icon name="undo" size={14} /> Renew policy
                </summary>
                <InsuranceForm f={f} renew />
              </details>
            )}
            <details className="xp-adder">
              <summary className="ap-btn ap-btn-ghost ap-btn-sm">
                <Icon name={ins.state === "none" ? "plus" : "edit"} size={14} /> {ins.state === "none" ? "Add insurance" : "Edit details"}
              </summary>
              <InsuranceForm f={f} renew={false} />
              {ins.state !== "none" && (
                <form action={saveInsuranceAction} className="xp-remove-details">
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="action" value="remove" />
                  <SubmitButton
                    className="ap-btn ap-btn-danger ap-btn-sm"
                    confirm="Remove the insurance details? Premiums already recorded are kept."
                  >
                    <Icon name="trash" size={13} /> Remove insurance details
                  </SubmitButton>
                </form>
              )}
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
