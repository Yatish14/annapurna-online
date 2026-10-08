"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { isValidMobile, normalizeMobile, requireUser } from "@/lib/auth";
import { diffDays, isIsoDate, parseLocalIST, todayIST } from "@/lib/dates";
import { fleetChoices } from "@/lib/expenses/fleet";
import { formatNumber, formatRupees, isPaymentMethod, parseAmount, parseWhole, PAYMENT_METHODS } from "@/lib/expenses/money";
import { cleanPlace, isState } from "@/lib/expenses/places";
import {
  addExpense,
  addPayment,
  clashText,
  createTrip,
  expenseText,
  findClash,
  getTripById,
  kmOf,
  paymentText,
  removeExpense,
  removePayment,
  setTripStatus,
  updateReadings,
  updateTrip,
  EXPENSE_LABELS,
  type ExpenseInput,
  type TripInput,
} from "@/lib/expenses/trips";
import { withFlash } from "../../filters";

const EXPENSE_ANCHORS = { fuel: "#fuel", repair: "#repairs", emi: "#emi", insurance: "#insurance" } as const;
const tripPath = (tripNo: string) => `/admin/expenses/bookings/${tripNo}`;
const vehiclePath = (id: number) => `/admin/expenses/fleet/${id}`;
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

type Parsed =
  | {
      ok: true;
      input: TripInput;
      odometerStart: number | null;
      odometerEnd: number | null;
      kmDirect: number | null;
      totalAmount: number | null;
      driverAmount: number | null;
      advance: { amount: number; method: keyof typeof PAYMENT_METHODS } | null;
      fuel: { amount: number; litres: number | null; spentOn: string } | null;
    }
  | { ok: false; error: string; field: string };

function readTripForm(fd: FormData, isNew: boolean): Parsed {
  const fail = (field: string, error: string): Parsed => ({ ok: false, field, error });

  const customerName = text(fd, "customer_name");
  if (customerName.length < 2 || customerName.length > 60) return fail("customer_name", "Enter the customer's name (2 to 60 letters).");
  const customerPhone = normalizeMobile(text(fd, "customer_phone"));
  if (!isValidMobile(customerPhone)) return fail("customer_phone", "Enter the customer's 10-digit mobile number (starting with 6, 7, 8 or 9).");

  const vehicleId = Number(fd.get("vehicle_id"));
  const driverId = Number(fd.get("driver_id"));
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) return fail("vehicle_id", "Choose the vehicle.");
  if (!Number.isSafeInteger(driverId) || driverId <= 0) return fail("driver_id", "Choose the driver.");

  const startDate = text(fd, "start_date");
  const endDate = text(fd, "end_date");
  if (!isIsoDate(startDate) || startDate < "2020-01-01" || startDate > "2099-12-31") return fail("start_date", "Choose the start date.");
  if (!isIsoDate(endDate) || endDate > "2099-12-31") return fail("end_date", "Choose the end date.");
  if (endDate < startDate) return fail("end_date", "The end date can't be before the start date.");
  if (diffDays(startDate, endDate) > 366) return fail("end_date", "A booking can be at most a year long. Check the dates.");

  const pickupState = text(fd, "pickup_state");
  const pickupCity = cleanPlace(fd.get("pickup_city"));
  if (!isState(pickupState)) return fail("pickup_state", "Choose the pickup state.");
  if (!pickupCity) return fail("pickup_city", "Choose or type the pickup city.");

  const roundTrip = fd.get("round_trip") === "1";
  let dropState = pickupState as string;
  let dropCity = pickupCity;
  let destState: string | null = null;
  let destCity: string | null = null;
  if (roundTrip) {
    destState = text(fd, "dest_state");
    destCity = cleanPlace(fd.get("dest_city"));
    if (!isState(destState)) return fail("dest_state", "Round trip: choose the state the vehicle went to.");
    if (!destCity) return fail("dest_city", "Round trip: choose or type the place the vehicle went to.");
  } else {
    dropState = text(fd, "drop_state");
    const city = cleanPlace(fd.get("drop_city"));
    if (!isState(dropState)) return fail("drop_state", "Choose the drop state.");
    if (!city) return fail("drop_city", "Choose or type the drop city.");
    dropCity = city;
  }

  const referrerName = optional(fd, "referrer_name", 60);
  const referrerRaw = text(fd, "referrer_phone");
  const referrerPhone = referrerRaw ? normalizeMobile(referrerRaw) : null;
  if (referrerPhone && !isValidMobile(referrerPhone)) return fail("referrer_phone", "Enter a valid 10-digit mobile number for the person who referred them, or leave it empty.");
  if (referrerPhone && !referrerName) return fail("referrer_name", "Add the name of the person who referred them.");
  if (referrerName && referrerName.length < 2) return fail("referrer_name", "Enter the full name of the person who referred them.");

  const notes = optional(fd, "notes", 500);

  const input: TripInput = {
    vehicleId, driverId, customerName, customerPhone, startDate, endDate,
    pickupState, pickupCity, dropState, dropCity, roundTrip, destState, destCity,
    referrerName, referrerPhone, notes,
  };
  if (!isNew) return { ok: true, input, odometerStart: null, odometerEnd: null, kmDirect: null, totalAmount: null, driverAmount: null, advance: null, fuel: null };

  // Km: the two odometer readings, or typed in directly
  const direct = fd.get("km_mode") === "direct";
  const odometerStart = direct ? null : parseWhole(fd.get("odometer_start"));
  if (odometerStart === "invalid") return fail("odometer_start", "The odometer reading should be a whole number of km.");
  const odometerEnd = direct ? null : parseWhole(fd.get("odometer_end"));
  if (odometerEnd === "invalid") return fail("odometer_end", "The odometer reading should be a whole number of km.");
  if (odometerEnd !== null && odometerStart === null) return fail("odometer_start", "Enter the odometer reading at the start as well as at the end.");
  if (odometerEnd !== null && odometerStart !== null && odometerEnd < odometerStart)
    return fail("odometer_end", "The odometer reading at the end can't be lower than at the start.");
  const kmDirect = direct ? parseWhole(fd.get("km_direct")) : null;
  if (kmDirect === "invalid" || (kmDirect !== null && kmDirect > 999999)) return fail("km_direct", "Enter the km travelled as a whole number, like 340.");
  const totalAmount = parseAmount(fd.get("total_amount"));
  if (totalAmount === "invalid") return fail("total_amount", "Enter the total as an amount in rupees, like 12000.");
  const driverAmount = parseAmount(fd.get("driver_amount"));
  if (driverAmount === "invalid") return fail("driver_amount", "Enter the driver's amount in rupees, like 1500.");
  const advanceAmount = parseAmount(fd.get("advance_amount"), { allowZero: false });
  if (advanceAmount === "invalid") return fail("advance_amount", "Enter the advance in rupees, like 2000 (or leave it empty).");
  if (advanceAmount !== null && totalAmount !== null && advanceAmount > totalAmount)
    return fail("advance_amount", "The advance is more than the total. Check both amounts.");
  const method = String(fd.get("advance_method") ?? "cash");
  // Fuel filled for the trip (optional): dated the start day, or today if the trip hasn't started yet
  const fuelAmount = parseAmount(fd.get("fuel_amount"), { allowZero: false });
  if (fuelAmount === "invalid") return fail("fuel_amount", "Enter the fuel amount in rupees, like 3000 (or leave it empty).");
  const litres = parseAmount(fd.get("fuel_litres"), { allowZero: false });
  if (litres === "invalid" || (litres !== null && litres > 9999)) return fail("fuel_litres", "Enter the litres as a number, like 32.5 (or leave it empty).");
  if (litres !== null && fuelAmount === null) return fail("fuel_amount", "Add what the fuel cost, or clear the litres.");
  const today = todayIST();

  return {
    ok: true,
    input,
    odometerStart,
    odometerEnd,
    kmDirect,
    totalAmount,
    driverAmount,
    advance: advanceAmount !== null ? { amount: advanceAmount, method: isPaymentMethod(method) ? method : "cash" } : null,
    fuel: fuelAmount !== null ? { amount: fuelAmount, litres, spentOn: startDate < today ? startDate : today } : null,
  };
}

/** Create a booking, or save the edited details of one (when the form has an id) */
export async function saveTrip(_prev: TripFormState, fd: FormData): Promise<TripFormState> {
  const user = await requireUser("manageExpenses");
  const id = fd.get("id") ? Number(fd.get("id")) : null;
  const before = id !== null ? await getTripById(id) : null;
  if (id !== null && !before) return { error: "This booking no longer exists." };

  const parsed = readTripForm(fd, id === null);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const { input } = parsed;

  // Vehicles and drivers that were switched off can't be picked for new bookings (an edit may keep them)
  const { vehicles, drivers } = await fleetChoices();
  const vehicle = vehicles.find((v) => v.id === input.vehicleId);
  const driver = drivers.find((d) => d.id === input.driverId);
  if (!vehicle || (!vehicle.active && before?.vehicle_id !== vehicle.id)) return { error: "Choose a vehicle from the list.", field: "vehicle_id" };
  if (!driver || (!driver.active && before?.driver_id !== driver.id)) return { error: "Choose a driver from the list.", field: "driver_id" };

  // Checked here first (the database also refuses it), so a refused booking doesn't use up a booking number
  const vehicleClash = await findClash("vehicle_id", input.vehicleId, input.startDate, input.endDate, id);
  if (vehicleClash) {
    return {
      error: `${vehicle.name} is already booked on these days: ${clashText(vehicleClash)}. Choose other dates or another vehicle.`,
      field: "start_date",
    };
  }

  if (fd.get("allow_driver_clash") !== "1") {
    const clash = await findClash("driver_id", input.driverId, input.startDate, input.endDate, id);
    if (clash) return { driverClash: `${driver.name} is already driving ${clashText(clash)}.` };
  }

  if (id === null) {
    const result = await createTrip(input, parsed, parsed.advance, parsed.fuel, user.name);
    if (!result.ok) {
      return {
        error: `${vehicle.name} is already booked on these days${result.clash ? `: ${clashText(result.clash)}` : ""}. Choose other dates or another vehicle.`,
        field: "start_date",
      };
    }
    const route = input.roundTrip
      ? `${input.pickupCity} → ${input.destCity} → ${input.pickupCity} (round trip)`
      : `${input.pickupCity} → ${input.dropCity}`;
    const km = kmOf({ odometer_start: parsed.odometerStart, odometer_end: parsed.odometerEnd, km_direct: parsed.kmDirect });
    await logActivity(
      user,
      "trip.created",
      result.trip_no,
      [`${input.customerName} (${input.customerPhone})`, `${vehicle.name} with ${driver.name}`, route,
        km !== null ? `${formatNumber(km)} km` : null,
        parsed.totalAmount !== null ? `Total ${formatRupees(parsed.totalAmount)}` : null].filter(Boolean).join(" · "),
    );
    if (parsed.advance) await logActivity(user, "payment.received", result.trip_no, `${paymentText(parsed.advance)} · Advance`);
    if (parsed.fuel) {
      const fuelText = expenseText({ kind: "fuel", amount: parsed.fuel.amount, litres: parsed.fuel.litres, description: null, shop_name: null, shop_city: null, shop_state: null, note: null });
      await logActivity(user, "expense.fuel_added", result.trip_no, `${fuelText} · ${vehicle.name}`);
    }
    refresh();
    redirect(withFlash(tripPath(result.trip_no), "trip-created", result.trip_no));
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
  refresh();
  redirect(withFlash(tripPath(result.trip_no), result.changes.length ? "trip-updated" : "trip-unchanged", result.trip_no));
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

  const amount = parseAmount(fd.get("amount"), { allowZero: false });
  const method = String(fd.get("method"));
  const paidAt = parseLocalIST(fd.get("paid_at"));
  if (amount === null || amount === "invalid") redirect(withFlash(back, "amount-invalid") + anchor);
  if (!isPaymentMethod(method)) redirect(withFlash(back, "invalid") + anchor);
  if (!paidAt) redirect(withFlash(back, "paid-at-invalid") + anchor);
  const note = optional(fd, "note", 120);

  const saved = await addPayment(trip.id, { party, amount, method, paidAt, note }, user.name);
  if (!saved) redirect(withFlash(back, "trip-not-active") + anchor);
  await logActivity(user, party === "driver" ? "payment.driver_paid" : "payment.received", trip.trip_no,
    `${paymentText({ amount, method, note })}${party === "driver" ? ` · to ${trip.driver_name}` : ""}`);
  refresh();
  redirect(withFlash(back, party === "driver" ? "driver-paid" : "payment-added", formatRupees(amount).replace("₹", "Rs ")) + anchor);
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

// ---------- Fuel and repairs ----------

export async function recordExpense(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const kind = fd.get("kind") === "repair" ? "repair" : "fuel";
  const tripId = fd.get("trip_id") ? Number(fd.get("trip_id")) : null;
  const vehicleId = Number(fd.get("vehicle_id"));
  const trip = tripId !== null ? await getTripById(tripId) : null;
  if (tripId !== null && !trip) redirect("/admin/expenses/bookings?flash=not-found");
  const back = trip ? tripPath(trip.trip_no) : vehiclePath(vehicleId);
  const anchor = kind === "fuel" ? "#fuel" : "#repairs";

  const amount = parseAmount(fd.get("amount"), { allowZero: false });
  if (amount === null || amount === "invalid") redirect(withFlash(back, "amount-invalid") + anchor);
  const spentOn = text(fd, "spent_on");
  if (!isIsoDate(spentOn) || spentOn < "2020-01-01" || spentOn > "2099-12-31") redirect(withFlash(back, "date-invalid") + anchor);

  const input: ExpenseInput = { kind, amount, spentOn, litres: null, description: null, shopName: null, shopState: null, shopCity: null, note: optional(fd, "note", 200) };
  if (kind === "fuel") {
    const litres = parseAmount(fd.get("litres"), { allowZero: false });
    if (litres === "invalid" || (litres !== null && litres > 9999)) redirect(withFlash(back, "litres-invalid") + anchor);
    input.litres = litres;
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
  await logActivity(user, kind === "fuel" ? "expense.fuel_added" : "expense.repair_added", saved.trip_no ?? saved.vehicle_name,
    saved.trip_no ? `${details} · ${saved.vehicle_name}` : details);
  refresh();
  redirect(withFlash(back, kind === "fuel" ? "fuel-added" : "repair-added", saved.vehicle_name) + anchor);
}

export async function deleteExpense(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const removed = await removeExpense(Number(fd.get("id")), user.name);
  if (!removed) redirect("/admin/expenses/bookings?flash=not-found");
  await logActivity(user, "expense.removed", removed.trip_no ?? removed.vehicle_name,
    `${EXPENSE_LABELS[removed.kind]} · ${expenseText(removed)}${removed.trip_no ? ` · ${removed.vehicle_name}` : ""}`);
  refresh();
  const back = fd.get("from") === "vehicle" || !removed.trip_no ? vehiclePath(removed.vehicle_id) : tripPath(removed.trip_no);
  redirect(withFlash(back, "expense-removed") + EXPENSE_ANCHORS[removed.kind]);
}
