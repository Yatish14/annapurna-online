import { query } from "../db";
import { diffDays, fmtLong, MONTHS_LONG, todayIST } from "../dates";
import { formatRupees } from "./money";

/** A vehicle's loan (EMI) and insurance, with what has been paid */
export type VehicleFinance = {
  id: number;
  name: string;
  active: boolean;
  emi_amount: number | null;
  emi_lender: string | null;
  emi_day: number | null;
  /** First and last EMI months, "YYYY-MM" */
  emi_start: string | null;
  emi_end: string | null;
  insurance_company: string | null;
  insurance_policy: string | null;
  insurance_premium: number | null;
  /** "YYYY-MM-DD" */
  insurance_from: string | null;
  insurance_to: string | null;
  /** Months with an EMI payment recorded, "YYYY-MM" */
  emi_paid_months: string[];
  emi_paid_total: number;
  insurance_paid_total: number;
};

const FINANCE_SELECT = `
  SELECT v.id::int AS id, v.name, v.active,
         v.emi_amount::float8 AS emi_amount, v.emi_lender, v.emi_day,
         to_char(v.emi_start, 'YYYY-MM') AS emi_start, to_char(v.emi_end, 'YYYY-MM') AS emi_end,
         v.insurance_company, v.insurance_policy, v.insurance_premium::float8 AS insurance_premium,
         v.insurance_from::text AS insurance_from, v.insurance_to::text AS insurance_to,
         coalesce((SELECT array_agg(to_char(e.period, 'YYYY-MM') ORDER BY e.period) FROM vehicle_expenses e
                   WHERE e.vehicle_id = v.id AND e.kind = 'emi' AND e.deleted_at IS NULL), '{}') AS emi_paid_months,
         (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
          WHERE e.vehicle_id = v.id AND e.kind = 'emi' AND e.deleted_at IS NULL) AS emi_paid_total,
         (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
          WHERE e.vehicle_id = v.id AND e.kind = 'insurance' AND e.deleted_at IS NULL) AS insurance_paid_total
  FROM vehicles v`;

export async function getFinance(vehicleId: number): Promise<VehicleFinance | null> {
  if (!Number.isSafeInteger(vehicleId)) return null;
  const [row] = await query<VehicleFinance>(`${FINANCE_SELECT} WHERE v.id = $1`, [vehicleId]);
  return row ?? null;
}

/** Every vehicle in use, plus switched-off ones that still have a loan or policy on record */
export async function listFinance(): Promise<VehicleFinance[]> {
  return query<VehicleFinance>(
    `${FINANCE_SELECT} WHERE v.active OR v.emi_amount IS NOT NULL OR v.insurance_to IS NOT NULL ORDER BY v.active DESC, lower(v.name)`,
  );
}

// ---------- Months ----------

export const monthText = (m: string) => `${MONTHS_LONG[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1;
export const addMonths = (m: string, n: number) => {
  const i = monthIndex(m) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
/** The EMI due date in a month: the due day, or the month's last day for short months */
function dueDate(month: string, day: number): string {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

// ---------- Status ----------

export type EmiStatus =
  | { state: "none" }
  | {
      state: "paid" | "due" | "overdue" | "not-started" | "finished";
      /** The month the status is about ("YYYY-MM") */
      month: string;
      due: string | null;
      months: number;
      paid: number;
      left: number;
      /** EMIs not yet paid × the EMI amount */
      remaining: number;
      /** Month suggested in the "Mark EMI paid" form */
      nextMonth: string;
    };

export function emiStatus(f: VehicleFinance, today = todayIST()): EmiStatus {
  if (!f.emi_amount || !f.emi_start || !f.emi_end || !f.emi_day) return { state: "none" };
  const thisMonth = today.slice(0, 7);
  const months = monthIndex(f.emi_end) - monthIndex(f.emi_start) + 1;
  const paidSet = new Set(f.emi_paid_months);
  const paid = f.emi_paid_months.filter((m) => m >= f.emi_start! && m <= f.emi_end!).length;
  const left = Math.max(months - paid, 0);
  const base = { months, paid, left, remaining: left * f.emi_amount };

  // Suggest this month, or the next one when it's already paid
  let nextMonth = thisMonth < f.emi_start ? f.emi_start : thisMonth;
  while (paidSet.has(nextMonth) && nextMonth < f.emi_end) nextMonth = addMonths(nextMonth, 1);

  if (thisMonth < f.emi_start) return { state: "not-started", month: f.emi_start, due: dueDate(f.emi_start, f.emi_day), nextMonth, ...base };
  if (thisMonth > f.emi_end || left === 0) return { state: "finished", month: f.emi_end, due: null, nextMonth, ...base };
  const due = dueDate(thisMonth, f.emi_day);
  const state = paidSet.has(thisMonth) ? "paid" : today > due ? "overdue" : "due";
  return { state, month: thisMonth, due, nextMonth, ...base };
}

export type InsuranceStatus = { state: "none" } | { state: "valid" | "soon" | "expired"; daysLeft: number };

/** "soon": expires within 30 days */
export function insuranceStatus(f: Pick<VehicleFinance, "insurance_to">, today = todayIST()): InsuranceStatus {
  if (!f.insurance_to) return { state: "none" };
  const daysLeft = diffDays(today, f.insurance_to);
  return { state: daysLeft < 0 ? "expired" : daysLeft <= 30 ? "soon" : "valid", daysLeft };
}

// ---------- Saving details ----------

export type EmiInput = { amount: number; lender: string; day: number; start: string; end: string };
export type InsuranceInput = { company: string; policy: string | null; premium: number; from: string; to: string };

const or = (v: string | number | null | undefined, empty = "none") => (v === null || v === undefined || v === "" ? empty : String(v));

/** Saves (or with null, removes) the loan details; returns what changed for the activity log */
export async function saveEmi(id: number, emi: EmiInput | null, by: string): Promise<{ name: string; changes: string[] } | null> {
  const before = await getFinance(id);
  if (!before) return null;
  const changes: string[] = [];
  const add = (label: string, from: string, to: string) => from !== to && changes.push(`${label}: ${from} → ${to}`);
  add("Lender", or(before.emi_lender), or(emi?.lender));
  add("EMI", before.emi_amount ? formatRupees(before.emi_amount) : "none", emi ? formatRupees(emi.amount) : "none");
  add("Due day", or(before.emi_day), or(emi?.day));
  add("From", before.emi_start ? monthText(before.emi_start) : "none", emi ? monthText(emi.start) : "none");
  add("To", before.emi_end ? monthText(before.emi_end) : "none", emi ? monthText(emi.end) : "none");
  if (changes.length) {
    await query(
      `UPDATE vehicles SET emi_amount = $2, emi_lender = $3, emi_day = $4, emi_start = $5::date, emi_end = $6::date,
              updated_at = now(), updated_by = $7
       WHERE id = $1`,
      [id, emi?.amount ?? null, emi?.lender ?? null, emi?.day ?? null, emi ? `${emi.start}-01` : null, emi ? `${emi.end}-01` : null, by],
    );
  }
  return { name: before.name, changes };
}

/** Saves (or with null, removes) the insurance policy; returns what changed for the activity log */
export async function saveInsurance(
  id: number,
  ins: InsuranceInput | null,
  by: string,
): Promise<{ name: string; changes: string[] } | null> {
  const before = await getFinance(id);
  if (!before) return null;
  const changes: string[] = [];
  const add = (label: string, from: string, to: string) => from !== to && changes.push(`${label}: ${from} → ${to}`);
  add("Company", or(before.insurance_company), or(ins?.company));
  add("Policy no.", or(before.insurance_policy), or(ins?.policy));
  add("Premium", before.insurance_premium ? formatRupees(before.insurance_premium) : "none", ins ? formatRupees(ins.premium) : "none");
  add("Valid from", before.insurance_from ? fmtLong(before.insurance_from) : "none", ins ? fmtLong(ins.from) : "none");
  add("Valid to", before.insurance_to ? fmtLong(before.insurance_to) : "none", ins ? fmtLong(ins.to) : "none");
  if (changes.length) {
    await query(
      `UPDATE vehicles SET insurance_company = $2, insurance_policy = $3, insurance_premium = $4,
              insurance_from = $5::date, insurance_to = $6::date, updated_at = now(), updated_by = $7
       WHERE id = $1`,
      [id, ins?.company ?? null, ins?.policy ?? null, ins?.premium ?? null, ins?.from ?? null, ins?.to ?? null, by],
    );
  }
  return { name: before.name, changes };
}

// ---------- Reminders (Overview) ----------

export type Reminder = {
  vehicleId: number;
  vehicle: string;
  kind: "emi" | "insurance";
  tone: "due" | "overdue";
  text: string;
};

/** EMIs of this month not paid yet, and insurance that has expired or expires within 30 days (vehicles in use) */
export async function reminders(today = todayIST()): Promise<Reminder[]> {
  const rows = await query<VehicleFinance>(
    `${FINANCE_SELECT} WHERE v.active AND (v.emi_amount IS NOT NULL OR v.insurance_to IS NOT NULL) ORDER BY lower(v.name)`,
  );
  const out: Reminder[] = [];
  for (const f of rows) {
    const emi = emiStatus(f, today);
    if (emi.state === "due" || emi.state === "overdue") {
      out.push({
        vehicleId: f.id,
        vehicle: f.name,
        kind: "emi",
        tone: emi.state,
        text: `${monthText(emi.month)} EMI of ${formatRupees(f.emi_amount!)} ${emi.state === "overdue" ? "was due" : "is due"} on ${fmtLong(emi.due!)}${f.emi_lender ? ` (${f.emi_lender})` : ""}`,
      });
    }
    const ins = insuranceStatus(f, today);
    if (ins.state === "soon" || ins.state === "expired") {
      out.push({
        vehicleId: f.id,
        vehicle: f.name,
        kind: "insurance",
        tone: ins.state === "expired" ? "overdue" : "due",
        text:
          ins.state === "expired"
            ? `Insurance expired on ${fmtLong(f.insurance_to!)} (${-ins.daysLeft} day${ins.daysLeft === -1 ? "" : "s"} ago)`
            : ins.daysLeft === 0
              ? `Insurance expires today`
              : `Insurance expires on ${fmtLong(f.insurance_to!)} (in ${ins.daysLeft} day${ins.daysLeft === 1 ? "" : "s"})`,
      });
    }
  }
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "overdue" ? -1 : 1));
}
