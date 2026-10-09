import Link from "next/link";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import VehicleFinancePanels from "@/components/expenses/VehicleFinance";
import { can, requireUser } from "@/lib/auth";
import { fmtLong, todayIST } from "@/lib/dates";
import { emiStatus, insuranceStatus, listFinance, monthText, reminders } from "@/lib/expenses/finance";
import { formatRupees } from "@/lib/expenses/money";
import { monthSummary } from "@/lib/expenses/overview";
import { vehicleExpenses } from "@/lib/expenses/trips";
import { readParams, type SearchParams } from "../../filters";

export const metadata = { title: "EMI & insurance · Expense Tracker" };

/** Payments shown under each vehicle here (the vehicle's page has them all) */
const RECENT = 4;

export default async function EmiPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const canManage = can(user, "manageExpenses");
  const params = await readParams(searchParams);
  const today = todayIST();
  const thisMonth = today.slice(0, 7);

  const [vehicles, alerts, summary] = await Promise.all([listFinance(), reminders(), monthSummary(thisMonth)]);
  const payments = await Promise.all(
    vehicles.map((v) =>
      Promise.all([vehicleExpenses(v.id, "emi", { pageSize: RECENT }), vehicleExpenses(v.id, "insurance", { pageSize: RECENT })]),
    ),
  );
  const rows = vehicles.map((f) => ({ f, emi: emiStatus(f, today), ins: insuranceStatus(f, today) }));
  const loanLeft = rows.reduce((acc, r) => acc + (r.emi.state === "none" ? 0 : r.emi.remaining), 0);
  const emiDue = rows.filter((r) => r.emi.state === "due" || r.emi.state === "overdue");

  const tiles = [
    { label: `EMIs to pay in ${monthText(thisMonth)}`, value: String(emiDue.length), tone: emiDue.some((r) => r.emi.state === "overdue") ? "red" : "navy" },
    { label: `Paid in ${monthText(thisMonth)}`, value: formatRupees(summary.emi + summary.insurance), tone: "green" },
    { label: "Loans still to pay", value: formatRupees(loanLeft), tone: "plum" },
    {
      label: "Insurance expiring (30 days)",
      value: String(rows.filter((r) => r.ins.state === "soon" || r.ins.state === "expired").length),
      tone: rows.some((r) => r.ins.state === "expired") ? "red" : "gold",
    },
  ];

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Expense Tracker"
        title="EMI & insurance"
        subtitle="Every vehicle's loan and insurance policy in one place: mark an EMI as paid, renew a policy, and see what is due."
      />
      <Flash params={params} floating />

      <section className="xp-sumtiles xp-sumtiles-4">
        {tiles.map((t) => (
          <div key={t.label} className={`xp-sumtile is-${t.tone}`}>
            <span>{t.label}</span>
            <strong>{t.value}</strong>
          </div>
        ))}
      </section>

      {alerts.length > 0 && (
        <section className="ap-panel xp-reminders">
          <div className="ap-panel-head">
            <h2>Reminders</h2>
          </div>
          <ul className="ap-rows">
            {alerts.map((a) => (
              <li key={`${a.vehicleId}-${a.kind}`} className={`ap-row xp-rowlink xp-reminder is-${a.tone}`}>
                <span className="xp-reminder-icon">
                  <Icon name={a.kind === "emi" ? "wallet" : "shield"} size={18} />
                </span>
                <div className="ap-row-main">
                  <a href={`#vehicle-${a.vehicleId}`} className="xp-cardlink">
                    <strong>{a.vehicle}</strong>
                  </a>
                  <span>{a.text}</span>
                </div>
                <span className={`xp-state ${a.tone === "overdue" ? "is-late" : "is-out"}`}>
                  {a.tone === "overdue" ? (a.kind === "emi" ? "Overdue" : "Expired") : "Due soon"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <section className="ap-panel">
          <p className="ap-empty-sm">
            No vehicles yet. <Link href="/admin/expenses/fleet" className="ap-link">Add your cars</Link> to track their loans and insurance.
          </p>
        </section>
      ) : (
        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>All vehicles</h2>
          </div>
          <div className="xp-tablewrap">
            <table className="xp-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Loan</th>
                  <th>EMI</th>
                  <th>{monthText(thisMonth)}</th>
                  <th>EMIs paid</th>
                  <th>Still to pay</th>
                  <th>Insurance</th>
                  <th>Valid till</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ f, emi, ins }) => (
                  <tr key={f.id}>
                    <th scope="row">
                      <a href={`#vehicle-${f.id}`}>{f.name}</a>
                      {!f.active && <small> (switched off)</small>}
                    </th>
                    <td data-label="Loan">{f.emi_lender ?? "—"}</td>
                    <td data-label="EMI">{f.emi_amount ? formatRupees(f.emi_amount) : "—"}</td>
                    <td data-label={monthText(thisMonth)}>
                      {emi.state === "none" ? (
                        "—"
                      ) : (
                        <span className={`xp-state ${emi.state === "paid" ? "is-free" : emi.state === "overdue" ? "is-late" : emi.state === "due" ? "is-out" : "is-off"}`}>
                          {emi.state === "paid"
                            ? "Paid"
                            : emi.state === "overdue"
                              ? "Overdue"
                              : emi.state === "due"
                                ? `Due ${fmtLong(emi.due!)}`
                                : emi.state === "not-started"
                                  ? "Not started"
                                  : "Completed"}
                        </span>
                      )}
                    </td>
                    <td data-label="EMIs paid">{emi.state === "none" ? "—" : `${emi.paid} of ${emi.months}`}</td>
                    <td data-label="Still to pay">{emi.state === "none" ? "—" : formatRupees(emi.remaining)}</td>
                    <td data-label="Insurance">{f.insurance_company ?? "—"}</td>
                    <td data-label="Valid till">
                      {ins.state === "none" ? (
                        "—"
                      ) : (
                        <span className={`xp-state ${ins.state === "valid" ? "is-free" : ins.state === "soon" ? "is-out" : "is-late"}`}>
                          {fmtLong(f.insurance_to!)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rows.map(({ f }, i) => {
        const [emi, insurance] = payments[i];
        return (
          <VehicleFinancePanels
            key={f.id}
            finance={f}
            emiEntries={emi.expenses}
            insuranceEntries={insurance.expenses}
            canManage={canManage}
            from="emi"
            heading={
              <div className="xp-vehiclehead" id={`vehicle-${f.id}`}>
                <h2>
                  <Icon name="car" size={18} /> {f.name}
                </h2>
                <Link href={`/admin/expenses/fleet/${f.id}`} className="ap-link">
                  Vehicle page <Icon name="arrow" size={15} />
                </Link>
              </div>
            }
            emiFooter={
              emi.total > RECENT ? (
                <p className="ap-hint">
                  Latest {RECENT} of {emi.total}.{" "}
                  <Link href={`/admin/expenses/fleet/${f.id}#emi`} className="ap-link">
                    See all
                  </Link>
                </p>
              ) : null
            }
            insuranceFooter={
              insurance.total > RECENT ? (
                <p className="ap-hint">
                  Latest {RECENT} of {insurance.total}.{" "}
                  <Link href={`/admin/expenses/fleet/${f.id}#insurance`} className="ap-link">
                    See all
                  </Link>
                </p>
              ) : null
            }
          />
        );
      })}
    </main>
  );
}
