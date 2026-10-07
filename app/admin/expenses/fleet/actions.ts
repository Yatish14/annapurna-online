"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { dbErrorCode } from "@/lib/db";
import { fmtLong, isIsoDate, todayIST } from "@/lib/dates";
import { getFinance, monthText, saveEmi, saveInsurance, type EmiInput, type InsuranceInput } from "@/lib/expenses/finance";
import { parseAmount } from "@/lib/expenses/money";
import { addExpense, expenseText } from "@/lib/expenses/trips";
import { isValidMobile, normalizeMobile, requireUser } from "@/lib/auth";
import {
  createDriver,
  createVehicle,
  deleteUnused,
  getDriver,
  getVehicle,
  renameVehicle,
  setActive,
  updateDriver,
} from "@/lib/expenses/fleet";
import { withFlash } from "../../filters";

const BACK = "/admin/expenses/fleet";
const vehiclePath = (id: number) => `/admin/expenses/fleet/${id}`;
const driverPath = (id: number) => `/admin/expenses/fleet/drivers/${id}`;
const name = (fd: FormData) => String(fd.get("name") ?? "").replace(/\s+/g, " ").trim();
const who = (d: { name: string; phone: string }) => `${d.name} (${d.phone})`;

/** Back to a page with a message (and fresh data) */
function done(path: string, flash: string, detail?: string): never {
  revalidatePath("/admin/expenses", "layout");
  redirect(withFlash(path, flash, detail));
}

// ---------- Vehicles ----------

export async function addVehicle(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const vehicle = name(fd);
  if (vehicle.length < 2 || vehicle.length > 60) redirect(withFlash(BACK, "vehicle-name"));
  const saved = await createVehicle(vehicle, user.name);
  if (saved === "exists") redirect(withFlash(BACK, "vehicle-exists", vehicle));
  await logActivity(user, "vehicle.created", vehicle, "Car");
  done(BACK, "vehicle-added", vehicle);
}

/** Rename, from the vehicle's page */
export async function editVehicle(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const before = await getVehicle(Number(fd.get("id")));
  if (!before) redirect(withFlash(BACK, "not-found"));
  const back = vehiclePath(before.id);
  const vehicle = name(fd);
  if (vehicle.length < 2 || vehicle.length > 60) redirect(withFlash(back, "vehicle-name"));
  if (vehicle === before.name) done(back, "trip-unchanged", vehicle);
  const saved = await renameVehicle(before.id, vehicle, user.name);
  if (saved === "exists") redirect(withFlash(back, "vehicle-exists", vehicle));
  if (saved === "missing") redirect(withFlash(BACK, "not-found"));
  await logActivity(user, "vehicle.renamed", vehicle, `Was called ${before.name}`);
  done(back, "vehicle-renamed", vehicle);
}

/** Delete when nothing refers to it yet; otherwise switch it off or back on (from the vehicle's page) */
export async function vehicleStatus(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const vehicle = await getVehicle(Number(fd.get("id")));
  if (!vehicle) redirect(withFlash(BACK, "not-found"));
  const back = vehiclePath(vehicle.id);
  const action = String(fd.get("action"));

  if (action === "delete") {
    if (!(await deleteUnused("vehicles", vehicle.id))) redirect(withFlash(back, "vehicle-in-use", vehicle.name));
    await logActivity(user, "vehicle.deleted", vehicle.name);
    done(BACK, "vehicle-deleted", vehicle.name);
  }
  const active = action === "activate";
  if (!(await setActive("vehicles", vehicle.id, active, user.name))) redirect(withFlash(back, "not-found"));
  await logActivity(user, active ? "vehicle.reactivated" : "vehicle.deactivated", vehicle.name);
  done(back, active ? "vehicle-on" : "vehicle-off", vehicle.name);
}

// ---------- Drivers ----------

function readDriver(fd: FormData): { name: string; phone: string } | "name" | "phone" {
  const driver = name(fd);
  const phone = normalizeMobile(String(fd.get("phone") ?? ""));
  if (driver.length < 2 || driver.length > 60) return "name";
  if (!isValidMobile(phone)) return "phone";
  return { name: driver, phone };
}

export async function addDriver(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const driver = readDriver(fd);
  if (driver === "name") redirect(withFlash(BACK, "driver-name"));
  if (driver === "phone") redirect(withFlash(BACK, "user-mobile"));
  const saved = await createDriver(driver, user.name);
  if (saved === "exists") redirect(withFlash(BACK, "driver-exists"));
  await logActivity(user, "driver.created", who(driver));
  done(BACK, "driver-added", driver.name);
}

/** Change name or mobile number, from the driver's page */
export async function editDriver(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const before = await getDriver(Number(fd.get("id")));
  if (!before) redirect(withFlash(BACK, "not-found"));
  const back = driverPath(before.id);
  const driver = readDriver(fd);
  if (driver === "name") redirect(withFlash(back, "driver-name"));
  if (driver === "phone") redirect(withFlash(back, "user-mobile"));
  if (driver.name === before.name && driver.phone === before.phone) done(back, "trip-unchanged", driver.name);
  const saved = await updateDriver(before.id, driver, user.name);
  if (saved === "exists") redirect(withFlash(back, "driver-exists"));
  if (saved === "missing") redirect(withFlash(BACK, "not-found"));
  await logActivity(user, "driver.updated", who(driver), `Was ${who(before)}`);
  done(back, "driver-updated", driver.name);
}

/** Delete when the driver has no bookings; otherwise switch them off or back on (from the driver's page) */
export async function driverStatus(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const driver = await getDriver(Number(fd.get("id")));
  if (!driver) redirect(withFlash(BACK, "not-found"));
  const back = driverPath(driver.id);
  const action = String(fd.get("action"));

  if (action === "delete") {
    if (!(await deleteUnused("drivers", driver.id))) redirect(withFlash(back, "driver-in-use", driver.name));
    await logActivity(user, "driver.deleted", who(driver));
    done(BACK, "driver-deleted", driver.name);
  }
  const active = action === "activate";
  if (!(await setActive("drivers", driver.id, active, user.name))) redirect(withFlash(back, "not-found"));
  await logActivity(user, active ? "driver.reactivated" : "driver.deactivated", who(driver));
  done(back, active ? "driver-on" : "driver-off", driver.name);
}

// ---------- Added from the booking form (stays on the form) ----------

export type QuickAdd<T> = { ok: true; item: T } | { ok: false; error: string; field: "name" | "phone" };

export async function quickAddVehicle(fd: FormData): Promise<QuickAdd<{ id: number; name: string; active: true }>> {
  const user = await requireUser("manageExpenses");
  const vehicle = name(fd);
  if (vehicle.length < 2 || vehicle.length > 60) return { ok: false, error: "Enter the vehicle's name (2 to 60 letters).", field: "name" };
  const id = await createVehicle(vehicle, user.name);
  if (id === "exists") return { ok: false, error: `A vehicle called “${vehicle}” already exists. Choose it from the list.`, field: "name" };
  await logActivity(user, "vehicle.created", vehicle, "Car");
  revalidatePath("/admin/expenses", "layout");
  return { ok: true, item: { id, name: vehicle, active: true } };
}

export async function quickAddDriver(fd: FormData): Promise<QuickAdd<{ id: number; name: string; phone: string; active: true }>> {
  const user = await requireUser("manageExpenses");
  const driver = readDriver(fd);
  if (driver === "name") return { ok: false, error: "Enter the driver's name (2 to 60 letters).", field: "name" };
  if (driver === "phone") return { ok: false, error: "Enter a valid 10-digit mobile number.", field: "phone" };
  const id = await createDriver(driver, user.name);
  if (id === "exists") return { ok: false, error: "A driver with this mobile number already exists. Choose them from the list.", field: "phone" };
  await logActivity(user, "driver.created", who(driver));
  revalidatePath("/admin/expenses", "layout");
  return { ok: true, item: { id, ...driver, active: true } };
}

// ---------- Loan (EMI) and insurance ----------

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function backTo(id: number, flash: string, anchor: string, detail?: string): never {
  revalidatePath("/admin/expenses", "layout");
  redirect(withFlash(vehiclePath(id), flash, detail) + anchor);
}

/** Save or remove a vehicle's loan details */
export async function saveEmiAction(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const id = Number(fd.get("id"));
  let emi: EmiInput | null = null;
  if (fd.get("action") !== "remove") {
    const amount = parseAmount(fd.get("amount"), { allowZero: false });
    const lender = String(fd.get("lender") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const day = Number(fd.get("day"));
    const start = String(fd.get("start") ?? "");
    const end = String(fd.get("end") ?? "");
    const valid =
      typeof amount === "number" && lender.length >= 2 && Number.isInteger(day) && day >= 1 && day <= 31 &&
      MONTH.test(start) && MONTH.test(end) && end >= start && start >= "2000-01" && end <= "2099-12";
    if (!valid) backTo(id, "emi-invalid", "#emi");
    emi = { amount: amount as number, lender, day, start, end };
  }
  const saved = await saveEmi(id, emi, user.name);
  if (!saved) redirect(withFlash(BACK, "not-found"));
  if (saved.changes.length) await logActivity(user, "vehicle.emi_updated", saved.name, saved.changes.join(" · "));
  backTo(id, !saved.changes.length ? "trip-unchanged" : emi ? "emi-saved" : "emi-removed", "#emi", saved.name);
}

/** Record an EMI as paid for a month */
export async function payEmiAction(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const id = Number(fd.get("id"));
  const finance = await getFinance(id);
  if (!finance) redirect(withFlash(BACK, "not-found"));
  const month = String(fd.get("month") ?? "");
  const amount = parseAmount(fd.get("amount"), { allowZero: false });
  const paidOn = String(fd.get("paid_on") ?? "");
  if (!MONTH.test(month) || typeof amount !== "number" || !isIsoDate(paidOn) || paidOn < "2000-01-01" || paidOn > todayIST()) {
    backTo(id, "emi-pay-invalid", "#emi");
  }
  const note = String(fd.get("note") ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  const input = {
    kind: "emi" as const, amount: amount as number, spentOn: paidOn, litres: null, description: finance.emi_lender,
    shopName: null, shopState: null, shopCity: null, period: month, note,
  };
  try {
    if (!(await addExpense({ vehicleId: id }, input, user.name))) redirect(withFlash(BACK, "not-found"));
  } catch (err) {
    if (dbErrorCode(err) === "23505") backTo(id, "emi-already-paid", "#emi", monthText(month));
    throw err;
  }
  await logActivity(user, "expense.emi_paid", finance.name, expenseText({ ...input, shop_name: null, shop_city: null, shop_state: null }));
  backTo(id, "emi-paid", "#emi", monthText(month));
}

/** Save the insurance policy (or remove it); when renewing, also record the premium as paid */
export async function saveInsuranceAction(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const id = Number(fd.get("id"));
  let ins: InsuranceInput | null = null;
  if (fd.get("action") !== "remove") {
    const company = String(fd.get("company") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const policy = String(fd.get("policy") ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
    const premium = parseAmount(fd.get("premium"), { allowZero: false });
    const from = String(fd.get("from") ?? "");
    const to = String(fd.get("to") ?? "");
    const valid = company.length >= 2 && typeof premium === "number" && isIsoDate(from) && isIsoDate(to) && to > from && from >= "2000-01-01" && to <= "2099-12-31";
    if (!valid) backTo(id, "insurance-invalid", "#insurance");
    ins = { company, policy, premium: premium as number, from, to };
  }
  const recordPayment = ins !== null && fd.get("record_payment") === "1";
  const paidOn = String(fd.get("paid_on") ?? "");
  if (recordPayment && (!isIsoDate(paidOn) || paidOn < "2000-01-01" || paidOn > todayIST())) backTo(id, "insurance-invalid", "#insurance");

  const saved = await saveInsurance(id, ins, user.name);
  if (!saved) redirect(withFlash(BACK, "not-found"));
  if (saved.changes.length) await logActivity(user, "vehicle.insurance_updated", saved.name, saved.changes.join(" · "));

  if (ins && recordPayment) {
    const input = {
      kind: "insurance" as const, amount: ins.premium, spentOn: paidOn, litres: null,
      description: [ins.company, ins.policy ? `Policy ${ins.policy}` : null, `${fmtLong(ins.from)} – ${fmtLong(ins.to)}`].filter(Boolean).join(" · "),
      shopName: null, shopState: null, shopCity: null, note: null,
    };
    await addExpense({ vehicleId: id }, input, user.name);
    await logActivity(user, "expense.insurance_paid", saved.name, expenseText({ ...input, shop_name: null, shop_city: null, shop_state: null }));
    backTo(id, "insurance-renewed", "#insurance", saved.name);
  }
  backTo(id, !saved.changes.length ? "trip-unchanged" : ins ? "insurance-saved" : "insurance-removed", "#insurance", saved.name);
}
