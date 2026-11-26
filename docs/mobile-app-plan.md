# Mobile app look: build plan

The admin already installs as a phone app (web app manifest, 26 Nov 2026). This plan makes it **look and feel** like
one on phones, following the designs in [mobile-design/](mobile-design/) (open `mockups.html` or the two board PNGs).

## Rules

- **Desktop doesn't change.** Every phone style lives in `app/admin-mobile.css`, inside
  `@media (max-width: 1000px)`: the same point where the sidebar already turns into the ☰ drawer today.
  Before each task, desktop screenshots of every page are compared with the ones taken before we started.
- **The landing page (`/`) is never touched**: `app/page.tsx`, `app/landing.css`, `components/Landing*`.
- Same colours, fonts and icons as the desktop (navy, gold, cream; Fraunces + Manrope; `components/admin/Icon.tsx`).
- Mostly CSS. New components only where phones need something desktop doesn't have (the tab bar, the More page).
- One task at a time: make the change → explain every line → you try it on your phone → commit when you say so.

## Every URL

| URL | What it is | Task |
|---|---|---|
| `/launch` **(new)** | The installed app's loading splash, then the dashboard | M0 |
| *(every admin page)* | Bottom tab bar, navy app header, no ☰ drawer | M1, M2 |
| `/admin/more` **(new)** | Everything that isn't a tab | M1 |
| `/admin` | Redirects to `/admin/print` (no change) | – |
| `/admin/print` | Print orders | M3 |
| `/admin/print/qr` | QR poster | M9 |
| `/admin/print/activity` | Printout activity | M9 |
| `/admin/expenses` | Expense overview | M4 |
| `/admin/expenses/bookings` | Bookings list | M5 |
| `/admin/expenses/bookings/[tripNo]` | One booking, e.g. `/admin/expenses/bookings/VB-0024` | M6 |
| `/admin/expenses/bookings/new` | New booking form | M7 |
| `/admin/expenses/bookings/[tripNo]/edit` | Edit booking form | M7 |
| `/admin/expenses/fleet` | Vehicles & drivers | M8 |
| `/admin/expenses/fleet/[id]` | One vehicle | M8 |
| `/admin/expenses/fleet/drivers/[id]` | One driver | M8 |
| `/admin/expenses/repairs` | Repairs | M8 |
| `/admin/expenses/fastag` | FASTag | M8 |
| `/admin/expenses/emi` | EMI & insurance | M8 |
| `/admin/expenses/reports` | Reports (PDFs) | M8 |
| `/admin/expenses/activity` | Expense activity | M9 |
| `/admin/assistant` | Annapurna Assist (the middle tab) | M10 |
| `/admin/assistant/[chatId]` | A saved chat | M10 |
| `/admin/assistant/usage` | Assist usage (super admin) | M10 |
| `/admin/users` | Users & roles | M11 |
| `/admin/account` | My account (password) | M11 |
| `/login` | Sign in (optional polish) | M12 |

**Not in this plan:** `/` (landing page, never touched), the customer print pages `/print`, `/print/order/…`, `/P`
(customers, not admins), and `/admin/cars/*` (hidden from the menu, kept as it is).

## Tasks

### Shell (every admin page)
- [x] **M0 Loading splash** (26 Nov 2026). While the installed app opens, the lotus fills with liquid gold
  (`components/admin/LaunchSplash.tsx`, `app/splash.css`). The app now starts at `/launch` (manifest `start_url`):
  a static page that shows at once, then opens `/admin/print` inside the app (`LaunchRedirect.tsx`). The splash stays
  up until the dashboard is ready. The phone's own splash (icon on navy) comes first and can't be animated, so ours
  matches it. Tried first: a `<Suspense>` around the admin layout. Dropped, because it sends "200 OK" before the page
  runs, so a missing chat or booking answered 200 instead of 404 (two tests caught it).
- [x] **M1 Bottom tab bar + More page** (26 Nov 2026). `components/admin/TabBar.tsx` (Prints · Bookings · Assist · Overview · More,
  with the new print orders badge), `app/admin/more/page.tsx` (the drawer's links as big rows, account, sign out),
  `app/admin-mobile.css`. The sidebar and the More page share one menu list (`components/admin/nav.ts`).
  On phones: the ☰ button, the drawer and the floating "Ask Assist" button are gone (the drawer's code too).
- [x] **M2 Navy app header** (26 Nov 2026). The top bar, the back link ("← All bookings") and each page's title block
  (`.ap-pagehead`, and `.xp-editablehead` on a vehicle or driver) share one navy background and read as one header; the
  first card overlaps its bottom edge. Navy things (QR poster, Super admin card) sit below it instead. The month switcher
  is see-through with white text, as in the designs. CSS only, in `app/admin-mobile.css`. (Save bars above the tab bar: done in M1.)

### Pages
- [x] **M3 Print orders** (`/admin/print`, 26 Nov 2026): order cards about half as tall. A file's name and size sit beside its
  icon; its settings chips, then Open and Print (side by side), use the full width. "Delete files now" and "Mark collected"
  share one row. For every page on phones (560px and narrower): filter chips (All · New · Printed…) on one swipeable line,
  less padding inside white panels. CSS only. (The uploads pill stays as it is: it already fits on one line.)
- [x] **M4 Overview** (`/admin/expenses`, 26 Nov 2026): one summary card in place of the four tiles (net, a money in /
  money out bar, bookings · km · billed). That card is the only new markup (`.xp-mobsum` in the page), hidden on desktop.
  "To collect" / "To pay drivers" side by side, moved above Reminders (CSS `order`). Vehicles: one card each, in a row
  you swipe sideways (`.xp-vehtable`).
- [x] **M5 Bookings list** (`/admin/expenses/bookings`, 26 Nov 2026): short rows (about 4 a screen instead of 1½). A date
  tile on the left; the booking number, status, customer, route and vehicle · driver in the middle; on the right, what's
  still due (red) or paid, and what the driver is still owed. New in `TripCard.tsx`: the date tile and the amount column
  (hidden on desktop), and `monthShort()` in `lib/dates.ts`. On phones the list leaves out the mobile number, "Created by"
  and the Open button (the whole card opens the booking). Gold "New booking" floats above the tab bar (`.xp-newfab`).
  Still to do: when a filter chip past the screen's edge is the selected one (e.g. Cancelled), it isn't scrolled into view.
- [ ] **M6 One booking** (`/admin/expenses/bookings/[tripNo]`): balance-due card with a paid bar, Call / WhatsApp /
  Payment / Fuel buttons, the page split into Details · Money · Costs · History tabs, "Record payment" fixed at the bottom.
- [ ] **M7 Booking form, in steps** (`…/new`, `…/[tripNo]/edit`): Customer → Vehicle & dates → Route → Amounts, with a
  progress bar and Back / Next; vehicles and drivers as tap cards.
- [ ] **M8 Fleet and cost pages**: vehicles & drivers, one vehicle, one driver, repairs, FASTag, EMI & insurance, reports.
- [ ] **M9 Activity pages and QR poster**: printout and expense activity as a timeline, QR poster sized for a phone.
- [ ] **M10 Annapurna Assist** (`/admin/assistant…`): full screen above the tab bar, chat list as a sheet.
- [ ] **M11 Users and account** (`/admin/users`, `/admin/account`).
- [ ] **M12 Sign in** (`/login`): optional polish, same navy and gold.

### Finish
- [ ] **M13 Tests**: a Playwright test that opens every URL above at phone size (no sideways scrolling, tab bar
  visible, nothing hidden under it) and at desktop size (no tab bar).
