// Adds sample bookings (and their activity history) to try the whole dashboard:
//   npm run db:seed              add / refresh the samples
//   npm run db:seed -- --clear   remove them again
// Samples are marked is_sample = true. Their mobile numbers look real (10 digits, starting 6–9)
// and might belong to someone, so the app never sends WhatsApp messages for sample bookings.
import { connect, schemaSql } from "./db.mjs";

const SAMPLE_TAG = "sample data";
// Numbers from an older version of this script
const OLD_SAMPLE_PHONE_PREFIX = "9100000";

const SAMPLE_PHONES = [
  "9848012345", "9866123456", "9701234567", "8885512345", "7702123456", "6301234567",
  "9490123456", "8019123456", "9959123456", "7396123456", "6281234567", "9052123456",
];

function dayFromToday(offset) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const CAR_NAMES = { carens: "Kia Carens", seltos: "Kia Seltos" };

// What each sample shows off in the dashboard
const SAMPLES = [
  // name, car, adults, children, start (days from today), days, pickup, status, extra
  ["Ravi Kumar", "carens", 5, 2, -1, 3, "Bus stand, Main Road", "confirmed", { note: "on a trip today" }],
  ["Lakshmi Devi", "seltos", 3, 1, 3, 2, "Near Ramalayam temple", "confirmed", {}],
  ["Venkatesh", "carens", 6, 1, 8, 1, "Railway station", "confirmed", {}],
  ["Suresh Babu", "carens", 4, 0, 8, 2, "College Road", "pending", { note: "clashes with Venkatesh's booking" }],
  ["Anitha", "seltos", 4, 0, 5, 1, "Market Yard", "pending", {}],
  ["Prasad Rao", "carens", 5, 2, 12, 3, "Shared location: https://maps.google.com/?q=16.5062,80.6480", "pending", {}],
  ["Kiran", "seltos", 2, 0, -2, 1, "RTC complex", "pending", { note: "start date has passed" }],
  ["Madhavi", "seltos", 2, 1, 3, 1, "Gandhi Nagar", "rejected", {}],
  ["Ramesh", "carens", 3, 0, 15, 2, "Temple Street", "cancelled", {}],
  ["Srinivas", "carens", 6, 0, -10, 2, "Highway junction", "confirmed", { note: "finished trip" }],
  ["Harika", "seltos", 1, 0, 20, 2, "Bank Colony", "pending", {}],
  ["Gopal", "carens", 2, 2, 25, 4, "Old Town", "confirmed", {}],
];

const db = await connect();
await db.exec(schemaSql);

// Remove earlier samples (safe to re-run)
await db.query(`DELETE FROM bookings WHERE is_sample OR phone LIKE $1`, [`${OLD_SAMPLE_PHONE_PREFIX}%`]);
await db.query(`DELETE FROM activity_log WHERE details LIKE $1`, [`%· ${SAMPLE_TAG}`]);

if (process.argv.includes("--clear")) {
  console.log("✓ Sample bookings and their activity removed.");
} else {
  const [owner] = await db.query(`SELECT name, mobile FROM users WHERE role = 'super_admin'`);
  const decidedBy = owner ?? { name: "Owner", mobile: null };

  let i = 0;
  for (const [name, car, adults, children, offset, days, pickup, status, extra] of SAMPLES) {
    i++;
    const phone = SAMPLE_PHONES[i - 1];
    const start = dayFromToday(offset);
    const end = dayFromToday(offset + days - 1);
    // Enquiries arrived over the last few days; decisions came a few hours later
    const receivedHoursAgo = 6 + i * 7;
    const decidedHoursAgo = receivedHoursAgo - 4;
    const decided = status !== "pending";

    const [row] = await db.query(
      `INSERT INTO bookings (phone, customer_name, car, adults, children, start_date, end_date, pickup_location, status,
                             created_at, updated_at, updated_by, is_sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               now() - make_interval(hours => $10), now() - make_interval(hours => $11), $12, true)
       RETURNING ref`,
      [phone, name, car, adults, children, start, end, pickup, status,
       receivedHoursAgo, decided ? decidedHoursAgo : receivedHoursAgo, decided ? decidedBy.name : null],
    );

    const trip = `${CAR_NAMES[car]} · ${start} to ${end} · ${adults} adults${children ? ` + ${children} children` : ""}`;
    await db.query(
      `INSERT INTO activity_log (at, actor_name, actor_mobile, action, target, details)
       VALUES (now() - make_interval(hours => $1), $2, $3, 'enquiry.created', $4, $5)`,
      [receivedHoursAgo, name, phone, row.ref, `${trip} · via WhatsApp · ${SAMPLE_TAG}`],
    );
    if (decided) {
      await db.query(
        `INSERT INTO activity_log (at, actor_name, actor_mobile, action, target, details)
         VALUES (now() - make_interval(hours => $1), $2, $3, $4, $5, $6)`,
        [decidedHoursAgo, decidedBy.name, decidedBy.mobile, `booking.${status}`, row.ref,
         `${trip} · test data, no message sent · ${SAMPLE_TAG}`],
      );
    }
    console.log(`  ${row.ref}  ${status.padEnd(9)} ${CAR_NAMES[car].padEnd(10)} ${start}  ${name}${extra.note ? `  (${extra.note})` : ""}`);
  }
  console.log(`✓ Added ${SAMPLES.length} sample bookings with their activity history.`);
}

await db.close();
