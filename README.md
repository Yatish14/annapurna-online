# Annapurna Online Services

Website, printout uploads (Annapurna Graphics and Internet), an expense tracker for the shop's own vehicles, WhatsApp car-booking bot and admin dashboard, built with Next.js.

| URL | What it is |
|---|---|
| `/` | Landing page |
| `/login` | Dashboard sign-in by mobile number (linked from the site's footer, hidden from search engines) |
| `/print` | Customers upload documents to print (opened by scanning the counter QR code) |
| `/print/order/…` | The customer's confirmation: order number to show at the counter, and its status |
| `/admin` | Opens **Printout → Orders** |
| `/admin/print` | Printout → Orders: files with the customer's options, Print button, mark collected, pause uploads |
| `/admin/print/qr` | Printout → QR poster for the counter (print it or download the QR code) |
| `/admin/print/activity` | Printout → Activity (admins and the super admin only) |
| `/admin/expenses` | Expense Tracker → Overview: money in and out for a month, what customers still owe, what drivers are still owed, figures per vehicle |
| `/admin/expenses/bookings` | Expense Tracker → Bookings: list with tabs and search; **New booking**; each booking's page has payments, fuel, repairs and its history |
| `/admin/expenses/fleet` | Expense Tracker → Vehicles & drivers (each vehicle has its own page with all its fuel and repairs) |
| `/admin/expenses/reports` | Expense Tracker → Reports: download a month's bookings, payments, fuel & repairs, or vehicle summary as CSV |
| `/admin/expenses/activity` | Expense Tracker → Activity (admins and the super admin only) |
| `/admin/cars` | Car Bookings (hidden from the sidebar: only legal with yellow-plate cars; pages kept, see `components/admin/Sidebar.tsx`) → Overview: counts, enquiries needing attention, fleet status, upcoming trips |
| `/admin/cars/bookings` | Car Bookings → all enquiries and bookings, with filters and actions |
| `/admin/cars/calendar` | Car Bookings → month calendar for each car |
| `/admin/cars/activity` | Car Bookings → Activity (admins and the super admin only) |
| `/admin/users` | Users & roles (admins and the super admin only) |
| `/admin/account` | My account: change your own password (everyone) |
| `/api/whatsapp/webhook` | Callback URL for the WhatsApp Cloud API |
| `/api/cron/print-cleanup` | Daily job (vercel.json) that deletes customers' files after 3 days |

## Run it locally

Requires Node.js 20+.

```bash
npm install
npm run super-admin -- create --name "Srimannarayana" --mobile 9949810683   # once per database; asks for a password
npm run dev
```

- Website: http://localhost:3000
- Dashboard: http://localhost:3000/login. Sign in with the super admin's mobile number and password, then add admins and viewers under **Users & roles**.

Locally, `DATABASE_URL=pglite:./.data/pglite` uses a built-in database stored in the `.data` folder, so no account is needed. To try the dashboard with sample bookings:

```bash
npm run db:seed            # 12 sample bookings covering every case (clash, past date, failed message, ...)
npm run db:seed -- --clear # removes them again
```

## Using Neon (online database)

1. Create a free project at https://neon.tech and copy its connection string.
2. Set `DATABASE_URL` to it, in `.env.local` or in your hosting settings.
3. Create the tables: `npm run db:migrate`. This is safe to run again at any time.
4. Create the super admin: `npm run super-admin -- create --name "…" --mobile …`. You only do this once.

## Settings (`.env.local`)

All keys are listed in [.env.example](.env.example). `.env.local` is in `.gitignore`, so never commit real values.

| Key | Where to get it |
|---|---|
| `DATABASE_URL` | Neon connection string, or `pglite:./.data/pglite` locally |
| `SESSION_SECRET` | Any random 32+ characters (already generated in `.env.local`) |
| `BLOB_STORE_ID` | Added by Vercel when you connect a Blob store (see Printout below); Vercel signs in with OIDC. On your computer, files are kept in `.data/uploads` instead |
| `CRON_SECRET` | Optional, any random string: only Vercel's scheduler can then run the clean-up job |
| `WHATSAPP_TOKEN` | Meta → your App → WhatsApp → API Setup (temporary, lasts 24 h) or a System User token (permanent, see below) |
| `WHATSAPP_PHONE_NUMBER_ID` | Same page, "Phone number ID". This is not the phone number itself. |
| `WHATSAPP_APP_SECRET` | Meta → your App → App settings → Basic → App secret |
| `WHATSAPP_VERIFY_TOKEN` | Any random string; Meta asks for the same value when you save the webhook (already generated) |
| `WHATSAPP_DRY_RUN` | `1` prints outgoing WhatsApp messages in the terminal instead of sending them |

## Connect WhatsApp

### 1. Give your computer a public URL (local testing only)

Meta can't reach `localhost`. While `npm run dev` is running, open a second terminal:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

It prints a URL such as `https://random-words.trycloudflare.com`. The URL changes every time you run the command. After deployment, use your real site URL instead.

### 2. Set the webhook in Meta

Go to Meta for Developers → your App → WhatsApp → **Configuration**:

- **Callback URL:** `https://<your-url>/api/whatsapp/webhook`
- **Verify token:** the `WHATSAPP_VERIFY_TOKEN` value from `.env.local`
- Click **Verify and save**, then under **Webhook fields** subscribe to **messages**.

Send "Hi" to your business number from WhatsApp. The bot should reply with the menu.

### 3. Create the two message templates

The "booked" and "not available" messages may be sent more than 24 hours after the customer's last message, so WhatsApp requires approved templates for them. In **WhatsApp Manager → Message templates → Create template**, choose category **Utility** and language **English**. If you pick "English (US)" instead, set `WHATSAPP_TEMPLATE_LANG=en_US`.

**Name:** `booking_confirmed`

```
Hello {{1}}, your car booking is confirmed! ✅

Ref: {{2}}
Car: {{3}} with driver
Dates: {{4}}
Passengers: {{5}}
Pickup: {{6}}

Our team will contact you before your trip. For help, call 99498 10683.
```

Sample values: `Ravi` · `AN-1001` · `Kia Carens` · `12 Oct – 13 Oct 2026 (2 days)` · `5 adults + 2 children` · `Bus stand, Main Road`

**Name:** `booking_unavailable`

```
Hello {{1}}, sorry, the {{2}} is not available for {{3}} (Ref: {{4}}).

Reply menu to choose other dates, or call 99498 10683 for help.
```

Sample values: `Ravi` · `Kia Carens` · `12 Oct – 13 Oct 2026 (2 days)` · `AN-1001`

Until a template is approved, the dashboard falls back to a plain message. WhatsApp only delivers that within 24 hours of the customer's last message. If neither can be sent, the booking shows the error and a **Resend message** button.

### 4. Permanent access token (before going live)

The token on the API Setup page expires after 24 hours. To get a permanent one:

1. Open Meta Business Settings → **Users → System users** and add an Admin system user.
2. **Assign assets**: give it your App and your WhatsApp account (full control).
3. **Generate token**: choose your App, set expiry to **Never**, and tick `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Put the token in `WHATSAPP_TOKEN`.

## Printout

Customers scan the QR code at the counter (**Printout → QR poster** in the dashboard), upload one or more files on `/print`, choose **colour or black & white, single or double-sided, pages** (not for photos) and **copies** for each file, and get an order number like **P-1042** to show at the counter.

- **Accepted files:** PDF, Word, Excel, PowerPoint, OpenDocument, RTF, text/CSV and photos (JPG, PNG, WebP, GIF, BMP, HEIC, TIFF). ZIP and other archives, programs and web pages are refused. Up to 10 files of 25 MB each per order. The server also checks each file really is what its name says.
- **Printing:** the **Print** button opens the browser's print dialog with the file exactly as uploaded, and shows the customer's options to choose in the dialog. PDFs, photos and text files print straight from the dashboard. Word, Excel, PowerPoint and iPhone (HEIC) photos are downloaded instead, to open and print in their app.
- **Status:** an order becomes *Printed* once each file has been printed, then *Collected* when you mark it. The customer's confirmation page shows the current status.
- **Privacy:** the print page shows a short privacy note before customers send anything. Files are stored privately (only signed-in dashboard users can open them) and are **deleted 3 days after upload**, by the daily job and whenever the Orders page is opened. If a customer asks, an admin can press **Delete files now** on the order; the order record is kept.
- **Pause uploads** on the Orders page when the shop is closed; the print page then asks customers to come to the counter.
- **Limits against abuse:** 60 uploads and 20 orders per network per hour, 300 uploads per day in total.

### Set up file storage on Vercel (once)

1. Vercel → your project → **Storage** → **Create** → **Blob** → choose **Private** → connect it to the project. Vercel adds `BLOB_STORE_ID` and the app signs in with OIDC, so no token is needed.
2. Optional: add `CRON_SECRET` (any random string) under Settings → Environment Variables.
3. Run `npm run db:migrate` against Neon once, to create the new tables.
4. Redeploy. Then print the poster from **Printout → QR poster**.

The free Blob plan has monthly limits on storage and uploads; check usage under Vercel → Storage. Deleting files after 3 days keeps storage small.

## Expense Tracker

Records the shop's own vehicle bookings and what each one earned and cost. Separate from the WhatsApp car bookings.

- **Vehicles & drivers:** add vehicles (a name, cars only for now) and drivers (name and mobile number). One that already has bookings can't be deleted, only switched off: it disappears from new bookings and keeps its history.
- **New booking:** customer name and mobile, vehicle, driver, start and end date, pickup state and city, drop state and city, and who referred the customer (optional). For a **round trip** the drop is the pickup city, and the form asks where the vehicle went instead. The city list depends on the state; a place that isn't in the list can be typed in. The total, advance, driver's amount and starting odometer can be entered now or later.
- **Clashes:** a vehicle can't have two bookings on the same days (the database refuses it too). A driver who is already on another booking gets a warning, and you can save anyway.
- **On the booking's page:**
  - odometer readings at start and end (km travelled is worked out), the total from the customer and the amount for the driver
  - customer payments and payments to the driver, each with its amount, method (cash, UPI, bank, other), date and time, and who recorded it
  - fuel (amount, litres) and repairs or servicing such as engine oil (what was done, amount, shop name, state and city)
  - its full history from the activity log
- **Payment status:** *Paid*, *Partly paid* or *Payment due* is worked out from the total and the payments, never typed in.
- **Profit:** total − driver amount − fuel − repairs.
- **Removing entries:** a payment, fuel or repair entered by mistake can be removed. It stays on the page crossed out, with who removed it and when.
- **Booking numbers:** VB-1001, VB-1002, …
- **Reports:** pick a month and download CSV files (open in Excel or Google Sheets): bookings starting in the month, payments made in the month, fuel and repairs dated in the month, and a per-vehicle summary. Amounts are plain numbers in rupees. Each download is recorded in Activity.
- **Sample data:** `npm run db:seed-expenses` adds 3 vehicles, 3 drivers and 25 bookings with payments, fuel and repairs (dates around today, marked with a *Sample* badge). `npm run db:seed-expenses -- --clear` removes them; booking numbers start again at VB-1001 when no bookings are left.
- **Cities:** the list of states and cities is `lib/expenses/india-places.json`, built by `node scripts/india-places.mjs` from the [countries-states-cities database](https://github.com/dr5hn/countries-states-cities-database) (Open Database License, free for commercial use with this credit).

## Users & roles

| Role | Who | Can do |
|---|---|---|
| **Super admin** | The owner. There is exactly one, created with `npm run super-admin -- create`. | Everything. Only role that can add admins/viewers and reset their passwords. Can't be removed. |
| **Admin** | Added by the super admin | Print orders, mark them collected, pause uploads. Everything in the Expense Tracker. Mark as booked, reject, cancel, resend messages. Can remove other users, but not the super admin or themselves. |
| **Viewer** | Added by the super admin | Read-only: print orders (can open files), Expense Tracker pages, car overview, bookings and calendar. Sees no buttons, and the server refuses any change. |

- **Signing in:** everyone signs in at `/login` with their mobile number and password.
- **Where users are stored:** everyone, including the super admin, is in the `users` table, with passwords stored as scrypt hashes.
- **Database protection:** the database itself refuses to delete the super admin, change their role, or add a second super admin.
- **Your own password:** anyone can change it under **My account** (click your name at the bottom of the sidebar).
- **Removing a user or resetting a password:** the user is signed out immediately.
- **Who changed what:** bookings and users record who last changed them and when (`updated_by`, `updated_at`), and the **Activity** page keeps the full history, including deletions and new WhatsApp enquiries (`activity_log` table).

**If the super admin forgets their password**, run this on a computer that has the project and the database settings:

```bash
npm run super-admin -- reset-password --mobile 9949810683
```

It asks for the new password without showing it on screen.

## How booking works

1. The customer says Hi and taps **Book a Car**.
2. They choose a car:
   - **Kia Carens:** up to 6 adults, and up to 7 people in total with children.
   - **Kia Seltos:** up to 4 people.
3. They choose the number of adults, then children. A child is under 12. The children question is skipped when the car is already full.
4. They choose a start date. Only free dates in the next 90 days are shown, starting tomorrow.
5. They choose the number of days, 1 to 7. Only trip lengths where every day is free are offered.
6. They type a pickup location, or share their location.
7. They confirm. The enquiry is saved as **pending** with a reference number like `AN-1001`.

In the dashboard:

- **Mark as Booked:** the dates are blocked for that car, and the customer receives `booking_confirmed`.
- **Reject:** the customer receives `booking_unavailable`.
- **Cancel booking**, on a booked trip: frees the dates. No message is sent, so call the customer.

Only booked trips block dates. If two enquiries ask for the same days, the second one is marked as a conflict once the first is booked. The database also refuses overlapping bookings for the same car, so a double booking can't happen.

A half-finished WhatsApp conversation is forgotten after 30 minutes. The customer can type **menu** at any time to start again.

Car limits, trip length, the booking window and the timeout are set in [lib/config.ts](lib/config.ts). The car limits are also enforced in [db/schema.sql](db/schema.sql).

## Project structure

```
app/
  page.tsx, landing.css          landing page
  login/                         sign-in page + sign-in/out actions
  print/                         customer upload page + confirmation page (print.css)
  admin/                         layout with sidebar; print/ (orders, qr, activity), expenses/ (overview,
                                 bookings, fleet, activity), cars/ (overview, bookings, calendar, activity),
                                 users/, account/
  admin.css                      dashboard styles
  api/whatsapp/webhook/route.ts  Meta verification + incoming messages
  api/print/                     uploads (Vercel Blob / local) and the dashboard file viewer
  api/cron/print-cleanup/        deletes files older than 3 days
components/                      landing page markup/effects, dashboard pieces
lib/
  config.ts                      business details, cars, booking rules
  bookings.ts                    availability + booking queries
  auth.ts                        roles, permissions, sign-in, session cookie
  users.ts                       dashboard users (admins, viewers)
  db.ts                          database connection (Neon or local PGlite)
  dates.ts                       date helpers (Indian time)
  whatsapp/flow.ts               the bot conversation
  whatsapp/client.ts             sending WhatsApp messages
  whatsapp/notify.ts             booked / not-available messages
  whatsapp/session.ts            conversation state
  print/files.ts                 accepted file types, print options
  print/orders.ts                print orders, upload slots, limits
  print/storage.ts               Vercel Blob or local folder
  print/qr.ts                    counter QR code with the logo
  expenses/trips.ts              Expense Tracker bookings, payments, fuel and repairs
  expenses/fleet.ts              vehicles and drivers
  expenses/overview.ts           monthly figures and amounts owed
  expenses/places.ts             Indian states (cities in india-places.json)
  activity.ts                    activity log (module: cars, print, expenses or users)
db/schema.sql                    tables and rules
scripts/                         migrate, seed, super-admin (create / reset password)
```
