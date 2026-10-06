// Adds sample Expense Tracker data (vehicles with loans and insurance, drivers, bookings, payments, fuel,
// repairs, EMIs and their activity)
// so every page and report has something to show:
//   npm run db:seed-expenses              add / refresh the samples
//   npm run db:seed-expenses -- --clear   remove them again
// Samples are marked is_sample = true and show a "Sample" badge. Dates are relative to today.
import { connect, schemaSql } from "./db.mjs";

const SAMPLE_TAG = "sample data";

const todayIST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
function day(offset) {
  const d = new Date(`${todayIST}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
/** A time in India on a day relative to today, e.g. at(-3, "18:30") */
const at = (offset, hhmm) => `${day(offset)}T${hhmm}:00+05:30`;
const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;
const roundTo = (n, step) => Math.round(n / step) * step;

const VEHICLES = [
  { name: "Innova Crysta", rate: 18, kmpl: 12, fuelPrice: 95.5, odometer: 48210 },
  { name: "Kia Carens", rate: 16, kmpl: 15, fuelPrice: 95.5, odometer: 22150 },
  { name: "Maruti Ertiga", rate: 14, kmpl: 16, fuelPrice: 108.4, odometer: 35480 },
];
const DRIVERS = [
  ["Suresh Babu", "9849012345"],
  ["Ramesh Naidu", "9912345678"],
  ["Venkat Rao", "8008123456"],
];
const CUSTOMERS = [
  ["Ravi Kumar", "9848022338"], ["Lakshmi Prasanna", "9866012345"], ["Srinivasa Rao", "9701122334"],
  ["Anitha Reddy", "8885522110"], ["Mohammed Imran", "7702233445"], ["Padma Latha", "6301122334"],
  ["Venkateswarlu", "9490011223"], ["Harika", "8019922334"], ["Kiran Kumar", "9959933445"],
  ["Sai Teja", "7396644556"], ["Durga Prasad", "6281155667"], ["Madhavi", "9052266778"],
  ["Naresh Chowdary", "9848133445"], ["Swathi", "9866244556"], ["Prakash Varma", "9701355667"],
  ["Bhavani Shankar", "8885466778"], ["Rajesh Goud", "7702577889"], ["Sowjanya", "6301688990"],
  ["Gopi Krishna", "9490799001"], ["Satyanarayana", "8019810112"], ["Ramya Sri", "9959921223"],
  ["Chandra Sekhar", "7396132334"], ["Usha Rani", "6281243445"], ["Vamsi Krishna", "9052354556"],
  ["Jyothi", "9848465667"],
];
const REFERRERS = [
  ["Gopal (auto stand)", "9440012345"],
  ["Hotel Manorama", "9989012345"],
  ["Prasad, travel agent", "9100123456"],
];

// Routes and the distance driven for the whole booking (one-way bookings also drive back empty)
const ROUTES = [
  { p: ["Andhra Pradesh", "Vijayawada"], d: ["Telangana", "Hyderabad"], km: 560 },
  { p: ["Andhra Pradesh", "Vijayawada"], to: ["Andhra Pradesh", "Tirupati"], km: 860 },
  { p: ["Andhra Pradesh", "Guntur"], to: ["Andhra Pradesh", "Srisailam"], km: 540 },
  { p: ["Andhra Pradesh", "Vijayawada"], to: ["Andhra Pradesh", "Araku Valley"], km: 820 },
  { p: ["Telangana", "Hyderabad"], d: ["Andhra Pradesh", "Vijayawada"], km: 560 },
  { p: ["Andhra Pradesh", "Guntur"], d: ["Andhra Pradesh", "Visakhapatnam"], km: 780 },
  { p: ["Andhra Pradesh", "Vijayawada"], to: ["Telangana", "Bhadrachalam"], km: 370 },
  { p: ["Andhra Pradesh", "Vijayawada"], d: ["Tamil Nadu", "Chennai"], km: 900 },
  { p: ["Andhra Pradesh", "Guntur"], to: ["Andhra Pradesh", "Annavaram"], km: 660 },
  { p: ["Andhra Pradesh", "Vijayawada"], to: ["Andhra Pradesh", "Rajamahendravaram"], km: 310 },
  { p: ["Andhra Pradesh", "Eluru"], d: ["Telangana", "Hyderabad"], km: 670 },
  { p: ["Andhra Pradesh", "Vijayawada"], to: ["Karnataka", "Bengaluru"], km: 1290 },
];

// vehicle, driver, start (days from today), days, route, extras
// pay: "full" (default for finished trips) | "partial" | "advance"   driverPay: "full" (default) | "half" | "none"
const BOOKINGS = [
  [0, 0, -80, 3, 1, {}],
  [1, 1, -75, 2, 0, { referrer: 0 }],
  [1, 1, -62, 3, 3, {}],
  [2, 2, -66, 2, 9, {}],
  [0, 0, -70, 2, 4, { pay: "partial" }],
  [0, 0, -58, 4, 7, { referrer: 1 }],
  [1, 2, -50, 2, 2, {}],
  [0, 1, -45, 1, 9, { driverPay: "half" }],
  [2, 2, -40, 3, 5, { referrer: 2 }],
  [1, 1, -38, 5, 11, { note: "Family trip, 7 people with luggage carrier." }],
  [0, 0, -33, 3, 1, {}],
  [2, 2, -28, 2, 6, { pay: "advance" }],
  [1, 1, -25, 2, 0, { cancelled: true }],
  [0, 0, -20, 2, 0, { acRepair: true }],
  [1, 1, -15, 3, 8, { referrer: 0, driverPay: "none" }],
  [2, 2, -12, 4, 3, { pay: "partial", puncture: true }],
  [0, 0, -8, 3, 5, { driverPay: "none" }],
  [1, 1, -4, 2, 10, { referrer: 1 }],
  [2, 2, -2, 4, 2, {}],
  [0, 0, -1, 3, 1, { referrer: 2 }],
  [1, 1, 3, 1, 9, { advance: true }],
  [0, 0, 6, 2, 0, { advance: true }],
  [1, 1, 10, 3, 3, {}],
  [0, 0, 15, 4, 7, { advance: true, referrer: 0 }],
  [2, 2, 20, 2, 4, { noTotal: true }],
];

// Repairs and servicing not linked to a booking
const VEHICLE_REPAIRS = [
  [0, -60, 4200, "Engine oil and filter change", "Lakshmi Toyota service centre", "Andhra Pradesh", "Vijayawada"],
  [1, -35, 9800, "Front tyres replaced (2)", "MRF Tyre Point", "Andhra Pradesh", "Guntur"],
  [2, -18, 5600, "General service", "Varun Motors (Maruti Arena)", "Andhra Pradesh", "Vijayawada"],
  [0, -10, 1200, "Wheel alignment and balancing", "Sri Sai Wheel Care", "Andhra Pradesh", "Vijayawada"],
];

const db = await connect();
await db.exec(schemaSql);

// ---------- Remove earlier samples (safe to re-run) ----------
await db.query(`DELETE FROM activity_log WHERE module = 'expenses' AND details LIKE $1`, [`%· ${SAMPLE_TAG}`]);
await db.query(
  `DELETE FROM trip_payments WHERE is_sample OR trip_id IN (SELECT id FROM trips WHERE is_sample)`,
);
await db.query(
  `DELETE FROM vehicle_expenses
   WHERE is_sample OR trip_id IN (SELECT id FROM trips WHERE is_sample)`,
);
await db.query(`DELETE FROM trips WHERE is_sample`);
await db.query(
  `DELETE FROM vehicles v WHERE is_sample
     AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.vehicle_id = v.id)
     AND NOT EXISTS (SELECT 1 FROM vehicle_expenses e WHERE e.vehicle_id = v.id)
   RETURNING id`,
);
await db.query(`DELETE FROM drivers d WHERE is_sample AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = d.id)`);
// With no bookings left, numbering starts again at VB-1001
const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM trips`);
if (n === 0) await db.query(`SELECT setval('trip_no_seq', 1001, false)`);

if (process.argv.includes("--clear")) {
  const [{ left }] = await db.query(`SELECT count(*)::int AS left FROM vehicles WHERE is_sample`);
  console.log(`✓ Sample Expense Tracker data removed${left ? ` (${left} sample vehicle(s) kept: real bookings or costs use them)` : ""}.`);
  await db.close();
  process.exit(0);
}

// ---------- Add samples ----------
const [owner] = await db.query(`SELECT name, mobile FROM users WHERE role = 'super_admin'`);
const actor = owner ?? { name: "Owner", mobile: null };
async function log(when, action, target, details) {
  await db.query(
    `INSERT INTO activity_log (at, actor_name, actor_mobile, action, module, target, details) VALUES ($1, $2, $3, $4, 'expenses', $5, $6)`,
    [when, actor.name, actor.mobile, action, target, `${details} · ${SAMPLE_TAG}`],
  );
}

const vehicleIds = [];
for (const v of VEHICLES) {
  const [row] = await db.query(
    `INSERT INTO vehicles (name, created_by, created_at, is_sample) VALUES ($1, $2, $3, true)
     ON CONFLICT (lower(name)) DO NOTHING RETURNING id`,
    [v.name, actor.name, at(-90, "10:00")],
  );
  if (!row) throw new Error(`A vehicle called "${v.name}" already exists. Rename it, or run with --clear first.`);
  vehicleIds.push(row.id);
  await log(at(-90, "10:00"), "vehicle.created", v.name, "Car");
}
const driverIds = [];
for (const [name, phone] of DRIVERS) {
  const [row] = await db.query(
    `INSERT INTO drivers (name, phone, created_by, created_at, is_sample) VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (phone) DO NOTHING RETURNING id`,
    [name, phone, actor.name, at(-90, "10:05")],
  );
  if (!row) throw new Error(`A driver with mobile ${phone} already exists. Run with --clear first.`);
  driverIds.push(row.id);
  await log(at(-90, "10:05"), "driver.created", `${name} (${phone})`);
}

const counts = { trips: 0, payments: 0, fuel: 0, repairs: 0, emi: 0, insurance: 0 };

// ---------- Loans (EMI) and insurance ----------
const thisMonth = todayIST.slice(0, 7);
const addMonths = (m, n) => {
  const i = Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
const monthName = (m) =>
  `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const yearLater = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const fmtDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const FINANCE = [
  // Innova: 4-year loan, EMIs paid up to date
  { emi: { amount: 18500, lender: "HDFC Bank", day: 5, start: -14, months: 48, paid: [-3, -2, -1, 0] },
    insurance: { company: "ICICI Lombard", policy: "3001/ICI/48213", premium: 32400, from: -200 } },
  // Carens: this month's EMI not paid yet, insurance about to expire
  { emi: { amount: 15200, lender: "Kotak Mahindra Prime", day: 10, start: -8, months: 60, paid: [-3, -2, -1] },
    insurance: { company: "Tata AIG", policy: "TA-0927-55120", premium: 27800, from: -345 } },
  // Ertiga: bought outright; insurance renewed recently (premium recorded)
  { emi: null, insurance: { company: "Bajaj Allianz", policy: "OG-26-1901-1801", premium: 21500, from: -40, recordPremium: true } },
];

for (const [vi, fin] of FINANCE.entries()) {
  const vehicle = VEHICLES[vi].name;
  if (fin.emi) {
    const e = fin.emi;
    const start = addMonths(thisMonth, e.start);
    const end = addMonths(start, e.months - 1);
    await db.query(
      `UPDATE vehicles SET emi_amount = $2, emi_lender = $3, emi_day = $4, emi_start = $5::date, emi_end = $6::date WHERE id = $1`,
      [vehicleIds[vi], e.amount, e.lender, e.day, `${start}-01`, `${end}-01`],
    );
    await log(at(-89, "12:00"), "vehicle.emi_updated", vehicle,
      `Lender: none → ${e.lender} · EMI: none → ${rupees(e.amount)} · Due day: none → ${e.day} · From: none → ${monthName(start)} · To: none → ${monthName(end)}`);
    for (const offset of e.paid) {
      const month = addMonths(thisMonth, offset);
      const paidOn = `${month}-${String(e.day).padStart(2, "0")}`;
      if (paidOn > todayIST) continue; // this month's EMI isn't due yet
      const when = `${paidOn}T10:30:00+05:30`;
      await db.query(
        `INSERT INTO vehicle_expenses (vehicle_id, kind, amount, spent_on, description, period, created_at, created_by, is_sample)
         VALUES ($1, 'emi', $2, $3, $4, $5::date, $6, $7, true)`,
        [vehicleIds[vi], e.amount, paidOn, e.lender, `${month}-01`, when, actor.name],
      );
      counts.emi++;
      await log(when, "expense.emi_paid", vehicle, `${rupees(e.amount)} · EMI for ${monthName(month)} · ${e.lender}`);
    }
  }
  const ins = fin.insurance;
  const from = day(ins.from);
  const to = yearLater(from);
  await db.query(
    `UPDATE vehicles SET insurance_company = $2, insurance_policy = $3, insurance_premium = $4, insurance_from = $5, insurance_to = $6 WHERE id = $1`,
    [vehicleIds[vi], ins.company, ins.policy, ins.premium, from, to],
  );
  await log(at(-89, "12:10"), "vehicle.insurance_updated", vehicle,
    `Company: none → ${ins.company} · Policy no.: none → ${ins.policy} · Premium: none → ${rupees(ins.premium)} · Valid to: none → ${fmtDay(to)}`);
  if (ins.recordPremium) {
    const description = `${ins.company} · Policy ${ins.policy} · ${fmtDay(from)} – ${fmtDay(to)}`;
    await db.query(
      `INSERT INTO vehicle_expenses (vehicle_id, kind, amount, spent_on, description, created_at, created_by, is_sample)
       VALUES ($1, 'insurance', $2, $3, $4, $5, $6, true)`,
      [vehicleIds[vi], ins.premium, from, description, at(ins.from, "11:00"), actor.name],
    );
    counts.insurance++;
    await log(at(ins.from, "11:00"), "expense.insurance_paid", vehicle, `${rupees(ins.premium)} · Insurance premium · ${description}`);
  }
}

// Book in date order, so booking numbers follow the dates
const order = BOOKINGS.map((b, i) => ({ b, i })).sort((x, y) => x.b[2] - y.b[2]);
const odometer = VEHICLES.map((v) => v.odometer);

for (const { b: [vi, di, offset, days, ri, extra], i } of order) {
  const v = VEHICLES[vi];
  const [driverName] = DRIVERS[di];
  const [customer, phone] = CUSTOMERS[i];
  const route = ROUTES[ri];
  const end = offset + days - 1;
  const phase = extra.cancelled ? "cancelled" : end < 0 ? "completed" : offset <= 0 ? "ongoing" : "upcoming";
  const created = Math.min(offset - 4, -1);
  const roundTrip = Boolean(route.to);
  const drop = roundTrip ? route.p : route.d;
  const total = extra.noTotal ? null : roundTo(route.km * v.rate + days * 300, 100);
  const driverAmount = days * 700;
  const referrer = extra.referrer !== undefined ? REFERRERS[extra.referrer] : null;

  // Odometer: a little local driving between bookings
  let odoStart = null;
  let odoEnd = null;
  if (phase === "completed" || phase === "ongoing") {
    odometer[vi] += 25 + ((i * 17) % 60);
    odoStart = odometer[vi];
    if (phase === "completed") {
      odoEnd = odoStart + route.km + ((i * 13) % 40);
      odometer[vi] = odoEnd;
    }
  }

  const [trip] = await db.query(
    `INSERT INTO trips (vehicle_id, driver_id, customer_name, customer_phone, start_date, end_date,
                        pickup_state, pickup_city, drop_state, drop_city, round_trip, dest_state, dest_city,
                        referrer_name, referrer_phone, notes, odometer_start, odometer_end, total_amount, driver_amount,
                        status, created_at, created_by, is_sample)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, true)
     RETURNING id, trip_no`,
    [
      vehicleIds[vi], driverIds[di], customer, phone, day(offset), day(end),
      route.p[0], route.p[1], drop[0], drop[1], roundTrip, route.to?.[0] ?? null, route.to?.[1] ?? null,
      referrer?.[0] ?? null, referrer?.[1] ?? null, extra.note ?? null, odoStart, odoEnd, total, driverAmount,
      phase === "cancelled" ? "cancelled" : "booked", at(created, "11:00"), actor.name,
    ],
  );
  counts.trips++;
  const routeText = roundTrip ? `${route.p[1]} → ${route.to[1]} → back` : `${route.p[1]} → ${route.d[1]}`;
  await log(at(created, "11:00"), "trip.created", trip.trip_no,
    [`${customer} (${phone})`, `${v.name} with ${driverName}`, routeText, total !== null ? `Total ${rupees(total)}` : null].filter(Boolean).join(" · "));

  if (phase === "cancelled") {
    await log(at(offset - 2, "16:20"), "trip.cancelled", trip.trip_no, `${customer} · ${v.name}`);
    continue;
  }

  async function pay(party, amount, method, when, note) {
    await db.query(
      `INSERT INTO trip_payments (trip_id, party, amount, method, paid_at, note, created_at, created_by, is_sample)
       VALUES ($1, $2, $3, $4, $5, $6, $5, $7, true)`,
      [trip.id, party, amount, method, when, note, actor.name],
    );
    counts.payments++;
    const label = { cash: "Cash", upi: "UPI", bank: "Bank transfer", other: "Other" }[method];
    await log(when, party === "driver" ? "payment.driver_paid" : "payment.received", trip.trip_no,
      [rupees(amount), label, note, party === "driver" ? `to ${driverName}` : null].filter(Boolean).join(" · "));
  }
  async function spend(kind, amount, when, fields) {
    await db.query(
      `INSERT INTO vehicle_expenses (vehicle_id, trip_id, kind, amount, spent_on, litres, description, shop_name, shop_state, shop_city,
                                     created_at, created_by, is_sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
      [vehicleIds[vi], trip.id, kind, amount, when.slice(0, 10), fields.litres ?? null, fields.description ?? null,
        fields.shop ?? null, fields.state ?? null, fields.city ?? null, when, actor.name],
    );
    counts[kind === "fuel" ? "fuel" : "repairs"]++;
    const details = kind === "fuel"
      ? `${rupees(amount)} · ${fields.litres} L · ${v.name}`
      : `${rupees(amount)} · ${fields.description}${fields.shop ? ` · ${fields.shop}, ${fields.city}, ${fields.state}` : ""} · ${v.name}`;
    await log(when, kind === "fuel" ? "expense.fuel_added" : "expense.repair_added", trip.trip_no, details);
  }

  // Customer: an advance when booking (not for every upcoming booking), the rest after the trip
  const advance = total === null ? null : Math.max(1000, roundTo(total * 0.25, 500));
  const takesAdvance = phase !== "upcoming" || extra.advance;
  if (advance && takesAdvance) await pay("customer", advance, i % 2 ? "upi" : "cash", at(created, "11:10"), "Advance");

  if (phase === "completed" || phase === "ongoing") {
    // Fuel: a full tank at the start, and a top-up on long trips
    const litres = Math.round(route.km / v.kmpl);
    const first = phase === "ongoing" || route.km < 600 ? litres : Math.round(litres * 0.6);
    await spend("fuel", Math.round(first * v.fuelPrice), at(offset, "07:15"), { litres: first });
    if (phase === "completed" && route.km >= 600) {
      const rest = litres - first;
      await spend("fuel", Math.round(rest * v.fuelPrice), at(offset + Math.floor(days / 2), "13:40"), { litres: rest });
    }
  }
  if (extra.acRepair) {
    await spend("repair", 1800, at(offset, "17:30"), { description: "AC gas refill", shop: "Cool Car AC Works", state: "Telangana", city: "Hyderabad" });
  }
  if (extra.puncture) {
    await spend("repair", 300, at(offset + 1, "10:20"), { description: "Puncture repair", shop: "Roadside tyre shop", state: route.to?.[0] ?? route.d[0], city: route.to?.[1] ?? route.d[1] });
  }

  if (phase === "completed") {
    await log(at(end, "20:30"), "trip.readings_updated", trip.trip_no,
      `Odometer at end: not set → ${odoEnd.toLocaleString("en-IN")} · ${(odoEnd - odoStart).toLocaleString("en-IN")} km travelled`);
    const plan = extra.pay ?? "full";
    const rest = total - (advance ?? 0);
    if (plan === "full" && rest > 0) await pay("customer", rest, i % 3 ? "upi" : "cash", at(end, "20:00"), "Balance");
    if (plan === "partial") await pay("customer", roundTo(rest / 2, 500), "upi", at(end, "20:00"), "Part of the balance");
    const driverPlan = extra.driverPay ?? "full";
    if (driverPlan === "full") await pay("driver", driverAmount, "cash", at(end, "21:00"), `Batta for ${days} day${days === 1 ? "" : "s"}`);
    if (driverPlan === "half") await pay("driver", driverAmount / 2, "cash", at(end, "21:00"), "Half now");
  }
}

for (const [vi, offset, amount, description, shop, state, city] of VEHICLE_REPAIRS) {
  await db.query(
    `INSERT INTO vehicle_expenses (vehicle_id, kind, amount, spent_on, description, shop_name, shop_state, shop_city, created_at, created_by, is_sample)
     VALUES ($1, 'repair', $2, $3, $4, $5, $6, $7, $8, $9, true)`,
    [vehicleIds[vi], amount, day(offset), description, shop, state, city, at(offset, "18:00"), actor.name],
  );
  counts.repairs++;
  await log(at(offset, "18:00"), "expense.repair_added", VEHICLES[vi].name, `${rupees(amount)} · ${description} · ${shop}, ${city}, ${state}`);
}

console.log(
  `✓ Added ${VEHICLES.length} vehicles, ${DRIVERS.length} drivers, ${counts.trips} bookings, ${counts.payments} payments, ` +
    `${counts.fuel} fuel, ${counts.repairs} repair, ${counts.emi} EMI and ${counts.insurance} insurance entries (marked as samples).`,
);
console.log("  Remove them with: npm run db:seed-expenses -- --clear");
await db.close();
