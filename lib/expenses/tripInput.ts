import { isValidMobile, normalizeMobile } from "../auth";
import { diffDays, isIsoDate, todayIST } from "../dates";
import { fleetChoices } from "./fleet";
import { logActivity, type Actor } from "../activity";
import { formatNumber, formatRupees, isPaymentMethod, parseAmount, parseWhole, PAYMENT_METHODS } from "./money";
import { cleanPlace, isState } from "./places";
import { parseDiscount } from "./discountInput";
import { clashText, createTrip, discountText, expenseText, findClash, kmOf, paymentText, type Trip, type TripDiscount, type TripInput } from "./trips";

/**
 * A booking's checks, in one place: the booking form (app/admin/expenses/bookings/actions.ts) and Annapurna Assist's
 * drafts (Step 4) both use these, so a booking the assistant prepares follows exactly the same rules, with the same
 * messages, as one typed into the form.
 *
 * parseTrip reads the values by the form's field names through `get`: the form passes FormData's get, the assistant
 * a plain object's. checkTrip then checks against the database: the vehicle and driver exist and are in use, and are
 * free on those days.
 */

/** Reads one value by its form field name ("customer_name", "start_date"…) */
export type Get = (name: string) => unknown;

/** A FormData, or a plain object with the same field names, as a Get */
export const fromForm = (fd: FormData): Get => (name) => fd.get(name);
export const fromObject = (values: Record<string, unknown>): Get => (name) => values[name] ?? null;

const text = (get: Get, key: string) => String(get(key) ?? "").replace(/\s+/g, " ").trim();
const optional = (get: Get, key: string, max: number) => text(get, key).slice(0, max) || null;

export type ParsedTrip =
  | {
      ok: true;
      input: TripInput;
      odometerStart: number | null;
      odometerEnd: number | null;
      kmDirect: number | null;
      totalAmount: number | null;
      /** Off the total (lib/expenses/discountInput.ts); amount null: none */
      discount: TripDiscount;
      driverAmount: number | null;
      advance: { amount: number; method: keyof typeof PAYMENT_METHODS } | null;
      fuel: { amount: number; litres: number | null; spentOn: string } | null;
    }
  | { ok: false; error: string; field: string };

/** The booking's values, checked one by one; the first problem comes back with the field it's about */
export function parseTrip(get: Get, isNew: boolean): ParsedTrip {
  const fail = (field: string, error: string): ParsedTrip => ({ ok: false, field, error });

  const customerName = text(get, "customer_name");
  if (customerName.length < 2 || customerName.length > 60) return fail("customer_name", "Enter the customer's name (2 to 60 letters).");
  const customerPhone = normalizeMobile(text(get, "customer_phone"));
  if (!isValidMobile(customerPhone)) return fail("customer_phone", "Enter the customer's 10-digit mobile number (starting with 6, 7, 8 or 9).");

  const vehicleId = Number(get("vehicle_id"));
  const driverId = Number(get("driver_id"));
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) return fail("vehicle_id", "Choose the vehicle.");
  if (!Number.isSafeInteger(driverId) || driverId <= 0) return fail("driver_id", "Choose the driver.");

  const startDate = text(get, "start_date");
  const endDate = text(get, "end_date");
  if (!isIsoDate(startDate) || startDate < "2020-01-01" || startDate > "2099-12-31") return fail("start_date", "Choose the start date.");
  if (!isIsoDate(endDate) || endDate > "2099-12-31") return fail("end_date", "Choose the end date.");
  if (endDate < startDate) return fail("end_date", "The end date can't be before the start date.");
  if (diffDays(startDate, endDate) > 366) return fail("end_date", "A booking can be at most a year long. Check the dates.");

  const pickupState = text(get, "pickup_state");
  const pickupCity = cleanPlace(get("pickup_city"));
  if (!isState(pickupState)) return fail("pickup_state", "Choose the pickup state.");
  if (!pickupCity) return fail("pickup_city", "Choose or type the pickup city.");

  const roundTrip = get("round_trip") === "1";
  let dropState = pickupState as string;
  let dropCity = pickupCity;
  let destState: string | null = null;
  let destCity: string | null = null;
  if (roundTrip) {
    destState = text(get, "dest_state");
    destCity = cleanPlace(get("dest_city"));
    if (!isState(destState)) return fail("dest_state", "Round trip: choose the state the vehicle went to.");
    if (!destCity) return fail("dest_city", "Round trip: choose or type the place the vehicle went to.");
  } else {
    dropState = text(get, "drop_state");
    const city = cleanPlace(get("drop_city"));
    if (!isState(dropState)) return fail("drop_state", "Choose the drop state.");
    if (!city) return fail("drop_city", "Choose or type the drop city.");
    dropCity = city;
  }

  const referrerName = optional(get, "referrer_name", 60);
  const referrerRaw = text(get, "referrer_phone");
  const referrerPhone = referrerRaw ? normalizeMobile(referrerRaw) : null;
  if (referrerPhone && !isValidMobile(referrerPhone)) return fail("referrer_phone", "Enter a valid 10-digit mobile number for the person who referred them, or leave it empty.");
  if (referrerPhone && !referrerName) return fail("referrer_name", "Add the name of the person who referred them.");
  if (referrerName && referrerName.length < 2) return fail("referrer_name", "Enter the full name of the person who referred them.");

  const notes = optional(get, "notes", 500);

  const input: TripInput = {
    vehicleId, driverId, customerName, customerPhone, startDate, endDate,
    pickupState, pickupCity, dropState, dropCity, roundTrip, destState, destCity,
    referrerName, referrerPhone, notes,
  };
  // Money, fuel and km: on a new booking the advance and fuel are its first payment and fuel entry;
  // when editing they add another one (left empty, nothing is added)

  // Km: the two odometer readings, or typed in directly
  const direct = get("km_mode") === "direct";
  const odometerStart = direct ? null : parseWhole(get("odometer_start"));
  if (odometerStart === "invalid") return fail("odometer_start", "The odometer reading should be a whole number of km.");
  const odometerEnd = direct ? null : parseWhole(get("odometer_end"));
  if (odometerEnd === "invalid") return fail("odometer_end", "The odometer reading should be a whole number of km.");
  if (odometerEnd !== null && odometerStart === null) return fail("odometer_start", "Enter the odometer reading at the start as well as at the end.");
  if (odometerEnd !== null && odometerStart !== null && odometerEnd < odometerStart)
    return fail("odometer_end", "The odometer reading at the end can't be lower than at the start.");
  const kmDirect = direct ? parseWhole(get("km_direct")) : null;
  if (kmDirect === "invalid" || (kmDirect !== null && kmDirect > 999999)) return fail("km_direct", "Enter the km travelled as a whole number, like 340.");
  const totalAmount = parseAmount(get("total_amount"));
  if (totalAmount === "invalid") return fail("total_amount", "Enter the total as an amount in rupees, like 12000.");
  // A discount off the total, in rupees or as a percentage of it (its rules are shared: discountInput.ts)
  const discount = parseDiscount(get, totalAmount);
  if (!discount.ok) return fail(discount.field, discount.error);
  const payable = totalAmount === null ? null : totalAmount - (discount.discount.amount ?? 0);
  const driverAmount = parseAmount(get("driver_amount"));
  if (driverAmount === "invalid") return fail("driver_amount", "Enter the driver's amount in rupees, like 1500.");
  const advanceAmount = parseAmount(get("advance_amount"), { allowZero: false });
  if (advanceAmount === "invalid") return fail("advance_amount", "Enter the advance in rupees, like 2000 (or leave it empty).");
  // (When editing, the payments already received count too: checked in saveTrip)
  if (isNew && advanceAmount !== null && payable !== null && advanceAmount > payable)
    return fail(
      "advance_amount",
      discount.discount.amount
        ? `The advance is more than the ${formatRupees(payable)} to pay after the discount. Check the amounts.`
        : "The advance is more than the total. Check both amounts.",
    );
  const method = String(get("advance_method") ?? "cash");
  // Fuel filled for the trip (optional). A new booking's: dated the start day, or today if the trip hasn't started yet;
  // fuel added while editing: today
  const fuelAmount = parseAmount(get("fuel_amount"), { allowZero: false });
  if (fuelAmount === "invalid") return fail("fuel_amount", "Enter the fuel amount in rupees, like 3000 (or leave it empty).");
  const litres = parseAmount(get("fuel_litres"), { allowZero: false });
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
    discount: discount.discount,
    driverAmount,
    advance: advanceAmount !== null ? { amount: advanceAmount, method: isPaymentMethod(method) ? method : "cash" } : null,
    fuel: fuelAmount !== null ? { amount: fuelAmount, litres, spentOn: isNew && startDate < today ? startDate : today } : null,
  };
}

type Choice = { id: number; name: string; active: boolean };

export type TripCheck =
  | { ok: true; vehicle: Choice; driver: Choice }
  /** A problem to fix; `field` is the form field it's about */
  | { ok: false; error: string; field: string }
  /** Everything else is fine, but the driver is on another booking on these days: ask before saving anyway */
  | { ok: false; driverClash: string; vehicle: Choice; driver: Choice };

/**
 * The checks that need the database: the vehicle and driver exist and are in use (an edited booking may keep ones
 * switched off since), the vehicle is free on those days, and so is the driver (unless allowDriverClash).
 * `before` is the booking being edited, if any, so it doesn't clash with itself.
 */
export async function checkTrip(
  input: TripInput,
  { before = null, allowDriverClash = false }: { before?: Trip | null; allowDriverClash?: boolean } = {},
): Promise<TripCheck> {
  // Vehicles and drivers that were switched off can't be picked for new bookings (an edit may keep them)
  const { vehicles, drivers } = await fleetChoices();
  const vehicle = vehicles.find((v) => v.id === input.vehicleId);
  const driver = drivers.find((d) => d.id === input.driverId);
  if (!vehicle || (!vehicle.active && before?.vehicle_id !== vehicle.id)) return { ok: false, error: "Choose a vehicle from the list.", field: "vehicle_id" };
  if (!driver || (!driver.active && before?.driver_id !== driver.id)) return { ok: false, error: "Choose a driver from the list.", field: "driver_id" };

  // Checked here first (the database also refuses it), so a refused booking doesn't use up a booking number
  const id = before?.id ?? null;
  const vehicleClash = await findClash("vehicle_id", input.vehicleId, input.startDate, input.endDate, id);
  if (vehicleClash) {
    return {
      ok: false,
      error: `${vehicle.name} is already booked on these days: ${clashText(vehicleClash)}. Choose other dates or another vehicle.`,
      field: "start_date",
    };
  }

  if (!allowDriverClash) {
    const clash = await findClash("driver_id", input.driverId, input.startDate, input.endDate, id);
    if (clash) return { ok: false, driverClash: `${driver.name} is already driving ${clashText(clash)}.`, vehicle, driver };
  }
  return { ok: true, vehicle, driver };
}

/**
 * Saves a new booking that passed parseTrip and checkTrip, with its activity log entries (the booking, and its
 * advance and fuel if any). The booking form and Annapurna Assist's Confirm both save through here (4.6), so a
 * booking made in the chat is saved and logged exactly like one made in the form. `via` ends the log entry, e.g.
 * "via Annapurna Assist".
 */
export async function createCheckedTrip(
  parsed: Extract<ParsedTrip, { ok: true }>,
  { vehicle, driver }: { vehicle: Choice; driver: Choice },
  user: Actor,
  via?: string,
): Promise<{ ok: true; tripNo: string } | { ok: false; error: string; field: string }> {
  const { input } = parsed;
  const result = await createTrip(input, parsed, parsed.advance, parsed.fuel, user.name);
  if (!result.ok) {
    // Booked by someone else between the check and the save: the database refused it
    return {
      ok: false,
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
      parsed.totalAmount !== null ? `Total ${formatRupees(parsed.totalAmount)}` : null,
      parsed.discount.amount !== null ? `Discount ${discountText(parsed.discount.amount, parsed.discount.reason)}` : null,
      via ?? null].filter(Boolean).join(" · "),
  );
  if (parsed.advance) await logActivity(user, "payment.received", result.trip_no, `${paymentText(parsed.advance)} · Advance`);
  if (parsed.fuel) {
    const fuelText = expenseText({ kind: "fuel", amount: parsed.fuel.amount, litres: parsed.fuel.litres, description: null, shop_name: null, shop_city: null, shop_state: null, note: null });
    await logActivity(user, "expense.fuel_added", result.trip_no, `${fuelText} · ${vehicle.name}`);
  }
  return { ok: true, tripNo: result.trip_no };
}
