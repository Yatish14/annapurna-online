"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { claimDraft, finishDraft, getDraft, releaseDraft } from "@/lib/assistant/draftStore";
import { requireUser } from "@/lib/auth";
import { isIsoDate, nowLocalIST } from "@/lib/dates";
import { formatRupees, parseAmount, parseWhole } from "@/lib/expenses/money";
import { cleanPlace, isState } from "@/lib/expenses/places";
import {
  addExpense,
  addPayment,
  clashText,
  expenseText,
  getTripById,
  paymentText,
  removeExpense,
  removePayment,
  setTripStatus,
  updateReadings,
  updateTrip,
  EXPENSE_LABELS,
  type ExpenseInput,
} from "@/lib/expenses/trips";
import { parseFuel, saveFuel } from "@/lib/expenses/fuelInput";
import { parsePayment, savePayment } from "@/lib/expenses/paymentInput";
import { checkTrip, createCheckedTrip, fromForm, parseTrip } from "@/lib/expenses/tripInput";
import { withFlash } from "../../filters";

const EXPENSE_ANCHORS = { fuel: "#fuel", other: "#other-expenses", repair: "#repairs", fastag: "#fastag", emi: "#emi", insurance: "#insurance" } as const;
const tripPath = (tripNo: string) => `/admin/expenses/bookings/${tripNo}`;
const vehiclePath = (id: number) => `/admin/expenses/fleet/${id}`;
/** The Repairs, FASTag and EMI & insurance pages, opened on the month of the entry */
const COST_PAGES = { repairs: "/admin/expenses/repairs", fastag: "/admin/expenses/fastag", emi: "/admin/expenses/emi" } as const;
const costPage = (from: FormDataEntryValue | null) => (from === "repairs" || from === "fastag" || from === "emi" ? COST_PAGES[from] : null);
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").replace(/\s+/g, " ").trim();
const optional = (fd: FormData, key: string, max: number) => text(fd, key).slice(0, max) || null;

function refresh() {
  revalidatePath("/admin/expenses", "layout");
}

// ---------- Booking form ----------

export type TripFormState = {
  error?: string;
  /** Name of the field to put the cursor in */
  field?: string;
  /** The driver is on another booking on these days; the form asks before saving anyway */
  driverClash?: string;
};

/** Create a booking, or save the edited details of one (when the form has an id) */
export async function saveTrip(_prev: TripFormState, fd: FormData): Promise<TripFormState> {
  const user = await requireUser("manageExpenses");
  const id = fd.get("id") ? Number(fd.get("id")) : null;
  const before = id !== null ? await getTripById(id) : null;
  if (id !== null && !before) return { error: "This booking no longer exists." };

  // The booking's checks live in lib/expenses/tripInput.ts, shared with Annapurna Assist's drafts
  const parsed = parseTrip(fromForm(fd), id === null);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const { input } = parsed;

  // Vehicle and driver in use and free on those days (the form asks before saving with a busy driver)
  const check = await checkTrip(input, { before, allowDriverClash: fd.get("allow_driver_clash") === "1" });
  if (!check.ok) return "driverClash" in check ? { driverClash: check.driverClash } : { error: check.error, field: check.field };
  const { vehicle } = check;

  if (id === null) {
    // Filled in from an Annapurna Assist draft ("Open in form", 4.8): take the draft first, as its Confirm button
    // does, so the same draft can't become two bookings (one here, one from the chat). A draft that's expired or
    // cancelled doesn't stop the form: what's in the form now is the admin's own.
    const draftId = text(fd, "from_draft");
    const claimed = draftId ? (await claimDraft(draftId, user.id)) !== null : false;
    if (draftId && !claimed) {
      const draft = await getDraft(draftId, user.id);
      if (draft?.status === "confirmed") {
        return { error: draft.result ? `This draft was already saved as ${draft.result}.` : "This draft is being saved already." };
      }
    }

    // Saved and logged the same way as a booking confirmed in Annapurna Assist (lib/expenses/tripInput.ts)
    const saved = await createCheckedTrip(parsed, check, user, claimed ? "from an Annapurna Assist draft" : undefined);
    if (!saved.ok) {
      if (claimed) await releaseDraft(draftId);
      return { error: saved.error, field: saved.field };
    }
    if (claimed) await finishDraft(draftId, saved.tripNo);
    refresh();
    redirect(withFlash(tripPath(saved.tripNo), "trip-created", saved.tripNo));
  }

  // A payment added while editing: with what is already received, it can't go past the total
  const received = before?.received ?? 0;
  if (parsed.advance && parsed.totalAmount !== null && received + parsed.advance.amount > parsed.totalAmount) {
    return {
      error: `With this payment the customer would have paid ${formatRupees(received + parsed.advance.amount)}, more than the total of ${formatRupees(parsed.totalAmount)} (${formatRupees(received)} is received already). Check both amounts.`,
      field: "advance_amount",
    };
  }

  const result = await updateTrip(id, input, user.name);
  if (!result.ok) {
    if (result.reason === "missing") return { error: "This booking no longer exists." };
    return {
      error: `${vehicle.name} is already booked on these days${result.clash ? `: ${clashText(result.clash)}` : ""}. Choose other dates or another vehicle.`,
      field: "start_date",
    };
  }
  if (result.changes.length) await logActivity(user, "trip.updated", result.trip_no, result.changes.join(" · "));

  // Money, fuel and km, as on the booking's page: the readings and amounts, then any payment or fuel added
  const readings = await updateReadings(
    id,
    { odometerStart: parsed.odometerStart, odometerEnd: parsed.odometerEnd, kmDirect: parsed.kmDirect, totalAmount: parsed.totalAmount, driverAmount: parsed.driverAmount },
    user.name,
  );
  if (readings?.changes.length) await logActivity(user, "trip.readings_updated", result.trip_no, readings.changes.join(" · "));
  if (parsed.advance) {
    const paid = await addPayment(id, { party: "customer", ...parsed.advance, paidAt: nowLocalIST(), note: null }, user.name);
    if (paid) await logActivity(user, "payment.received", result.trip_no, paymentText({ ...parsed.advance, note: null }));
  }
  if (parsed.fuel) {
    const fuel: ExpenseInput = {
      kind: "fuel", amount: parsed.fuel.amount, spentOn: parsed.fuel.spentOn, litres: parsed.fuel.litres,
      description: null, shopName: null, shopState: null, shopCity: null, note: null,
    };
    const saved = await addExpense({ tripId: id }, fuel, user.name);
    if (saved) {
      const fuelText = expenseText({ kind: "fuel", amount: fuel.amount, litres: fuel.litres, description: null, shop_name: null, shop_city: null, shop_state: null, note: null });
      await logActivity(user, "expense.fuel_added", result.trip_no, `${fuelText} · ${saved.vehicle_name}`);
    }
  }

  const changed = result.changes.length > 0 || Boolean(readings?.changes.length) || parsed.advance !== null || parsed.fuel !== null;
  refresh();
  redirect(withFlash(tripPath(result.trip_no), changed ? "trip-updated" : "trip-unchanged", result.trip_no));
}

// ---------- Readings and amounts ----------

export async function saveReadings(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const trip = await getTripById(Number(fd.get("id")));
  if (!trip) redirect("/admin/expenses/bookings?flash=not-found");
  const back = tripPath(trip.trip_no);

  // Either the two odometer readings, or the km typed in directly (saving one clears the other)
  const direct = fd.get("km_mode") === "direct";
  const odometerStart = direct ? null : parseWhole(fd.get("odometer_start"));
  const odometerEnd = direct ? null : parseWhole(fd.get("odometer_end"));
  const kmDirect = direct ? parseWhole(fd.get("km_direct")) : null;
  const totalAmount = parseAmount(fd.get("total_amount"));
  const driverAmount = parseAmount(fd.get("driver_amount"));
  if (odometerStart === "invalid" || odometerEnd === "invalid") redirect(withFlash(back, "odometer-invalid") + "#readings");
  if (kmDirect === "invalid" || (kmDirect !== null && kmDirect > 999999)) redirect(withFlash(back, "km-invalid") + "#readings");
  if (totalAmount === "invalid" || driverAmount === "invalid") redirect(withFlash(back, "amount-invalid") + "#readings");
  if (odometerEnd !== null && odometerStart === null) redirect(withFlash(back, "odometer-start-missing") + "#readings");
  if (odometerEnd !== null && odometerStart !== null && odometerEnd < odometerStart) redirect(withFlash(back, "odometer-order") + "#readings");

  const result = await updateReadings(trip.id, { odometerStart, odometerEnd, kmDirect, totalAmount, driverAmount }, user.name);
  if (!result) redirect("/admin/expenses/bookings?flash=not-found");
  if (result.changes.length) await logActivity(user, "trip.readings_updated", result.trip_no, result.changes.join(" · "));
  refresh();
  redirect(withFlash(back, result.changes.length ? "readings-saved" : "trip-unchanged", result.trip_no));
}

// ---------- Cancel / restore ----------

export async function changeTripStatus(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const action = String(fd.get("action"));
  const trip = await getTripById(Number(fd.get("id")));
  if (!trip || (action !== "cancel" && action !== "restore")) redirect("/admin/expenses/bookings?flash=not-found");
  const back = tripPath(trip.trip_no);

  const result = await setTripStatus(trip.id, action === "cancel" ? "cancelled" : "booked", user.name);
  if (!result.ok) {
    if (result.reason === "missing") redirect(withFlash(back, "not-found"));
    redirect(withFlash(back, "restore-busy", result.clash?.trip_no));
  }
  await logActivity(
    user,
    action === "cancel" ? "trip.cancelled" : "trip.restored",
    trip.trip_no,
    `${trip.customer_name} · ${trip.vehicle_name}`,
  );
  refresh();
  redirect(withFlash(back, action === "cancel" ? "trip-cancelled" : "trip-restored", trip.trip_no));
}

// ---------- Payments ----------

export async function recordPayment(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const trip = await getTripById(Number(fd.get("trip_id")));
  if (!trip) redirect("/admin/expenses/bookings?flash=not-found");
  const party = fd.get("party") === "driver" ? "driver" : "customer";
  const back = tripPath(trip.trip_no);
  const anchor = party === "driver" ? "#driver-payments" : "#customer-payments";

  // The checks and the saving are shared with Annapurna Assist's payment drafts (lib/expenses/paymentInput.ts)
  const parsed = parsePayment(fromForm(fd));
  if (!parsed.ok) redirect(withFlash(back, parsed.problem) + anchor);
  const { payment } = parsed;
  if (!(await savePayment(trip, payment, user))) redirect(withFlash(back, "trip-not-active") + anchor);
  refresh();
  redirect(withFlash(back, party === "driver" ? "driver-paid" : "payment-added", formatRupees(payment.amount).replace("₹", "Rs ")) + anchor);
}

export async function deletePayment(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const removed = await removePayment(Number(fd.get("id")), user.name);
  const tripNo = String(fd.get("trip_no") ?? "");
  const back = /^VB-\d+$/.test(tripNo) ? tripPath(tripNo) : "/admin/expenses/bookings";
  if (!removed) redirect(withFlash(back, "not-found"));
  await logActivity(user, "payment.removed", removed.trip_no,
    `${removed.party === "driver" ? "Driver payment" : "Customer payment"} · ${paymentText(removed)}`);
  refresh();
  redirect(withFlash(tripPath(removed.trip_no), "payment-removed") + (removed.party === "driver" ? "#driver-payments" : "#customer-payments"));
}

// ---------- Fuel and other expenses of a booking; repairs and FASTag recharges of a vehicle ----------

const FLASH_ADDED = { fuel: "fuel-added", other: "other-added", repair: "repair-added", fastag: "fastag-added" } as const;
const ACTIVITY_ADDED = {
  fuel: "expense.fuel_added",
  other: "expense.other_added",
  repair: "expense.repair_added",
  fastag: "expense.fastag_added",
} as const;

export async function recordExpense(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const kindRaw = fd.get("kind");
  const kind = kindRaw === "repair" || kindRaw === "fastag" || kindRaw === "other" ? kindRaw : "fuel";
  // Only fuel and other expenses go on a booking: repairs and FASTag belong to the vehicle
  const tripId = (kind === "fuel" || kind === "other") && fd.get("trip_id") ? Number(fd.get("trip_id")) : null;
  const vehicleId = Number(fd.get("vehicle_id"));
  const trip = tripId !== null ? await getTripById(tripId) : null;
  if (tripId !== null && !trip) redirect("/admin/expenses/bookings?flash=not-found");
  // Other expenses (tolls, parking…) only exist on a booking
  if (kind === "other" && !trip) redirect("/admin/expenses/bookings?flash=not-found");
  const page = costPage(fd.get("from"));
  const anchor = EXPENSE_ANCHORS[kind];
  const spentOn = text(fd, "spent_on");
  const back = trip ? tripPath(trip.trip_no) : page ? (isIsoDate(spentOn) ? `${page}?month=${spentOn.slice(0, 7)}` : page) : vehiclePath(vehicleId);
  if (!trip && (!Number.isSafeInteger(vehicleId) || vehicleId <= 0)) redirect(withFlash(back, "vehicle-missing") + anchor);

  // Fuel: checks and saving shared with Annapurna Assist's fuel drafts (lib/expenses/fuelInput.ts)
  if (kind === "fuel") {
    const parsed = parseFuel(fromForm(fd));
    if (!parsed.ok) redirect(withFlash(back, parsed.problem) + anchor);
    const saved = await saveFuel(trip ? { tripId: trip.id } : { vehicleId }, parsed.fuel, user);
    if (!saved) redirect(withFlash(back, trip ? "trip-not-active" : "not-found") + anchor);
    refresh();
    redirect(withFlash(back, FLASH_ADDED.fuel, saved.vehicle_name) + anchor);
  }

  const amount = parseAmount(fd.get("amount"), { allowZero: false });
  if (amount === null || amount === "invalid") redirect(withFlash(back, "amount-invalid") + anchor);
  if (!isIsoDate(spentOn) || spentOn < "2020-01-01" || spentOn > "2099-12-31") redirect(withFlash(back, "date-invalid") + anchor);

  const input: ExpenseInput = { kind, amount, spentOn, litres: null, description: null, shopName: null, shopState: null, shopCity: null, note: optional(fd, "note", 200) };
  if (kind === "fastag") {
    input.description = optional(fd, "description", 80);
  } else if (kind === "other") {
    input.description = optional(fd, "description", 60);
    if (!input.description || input.description.length < 2) redirect(withFlash(back, "expense-what") + anchor);
  } else {
    input.description = optional(fd, "description", 120);
    if (!input.description || input.description.length < 2) redirect(withFlash(back, "repair-what") + anchor);
    input.shopName = optional(fd, "shop_name", 80);
    const state = text(fd, "shop_state");
    if (state) {
      if (!isState(state)) redirect(withFlash(back, "invalid") + anchor);
      input.shopState = state;
      input.shopCity = cleanPlace(fd.get("shop_city"));
      if (!input.shopCity) redirect(withFlash(back, "shop-city") + anchor);
    }
  }

  const saved = await addExpense(trip ? { tripId: trip.id } : { vehicleId }, input, user.name);
  if (!saved) redirect(withFlash(back, trip ? "trip-not-active" : "not-found") + anchor);
  const details = expenseText({
    kind, amount, litres: input.litres, description: input.description, shop_name: input.shopName,
    shop_city: input.shopCity, shop_state: input.shopState, note: input.note,
  });
  await logActivity(user, ACTIVITY_ADDED[kind], saved.trip_no ?? saved.vehicle_name,
    saved.trip_no ? `${details} · ${saved.vehicle_name}` : details);
  refresh();
  redirect(withFlash(back, FLASH_ADDED[kind], saved.vehicle_name) + anchor);
}

export async function deleteExpense(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const removed = await removeExpense(Number(fd.get("id")), user.name);
  if (!removed) redirect("/admin/expenses/bookings?flash=not-found");
  await logActivity(user, "expense.removed", removed.trip_no ?? removed.vehicle_name,
    `${EXPENSE_LABELS[removed.kind]} · ${expenseText(removed)}${removed.trip_no ? ` · ${removed.vehicle_name}` : ""}`);
  refresh();
  const page = costPage(fd.get("from"));
  const back = page
    ? `${page}?month=${removed.spent_on.slice(0, 7)}`
    : fd.get("from") === "vehicle" || !removed.trip_no
      ? vehiclePath(removed.vehicle_id)
      : tripPath(removed.trip_no);
  redirect(withFlash(back, "expense-removed") + EXPENSE_ANCHORS[removed.kind]);
}
