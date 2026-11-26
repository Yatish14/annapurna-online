import type { IconName } from "./Icon";
import type { ModuleId } from "./sidebarCookie";

/** A menu link. `lock` names the permission a role needs; without it the link shows greyed out and says why. */
export type NavItem = { href: string; label: string; icon: IconName; lock?: "activity" };
export type NavModule = { id: ModuleId; label: string; icon: IconName; items: NavItem[] };

/** The dashboard's modules: the desktop sidebar (Sidebar.tsx) and the phone's More page (app/admin/more) both list these */
export const NAV_MODULES: NavModule[] = [
  {
    id: "print",
    label: "Printout",
    icon: "printer",
    items: [
      { href: "/admin/print", label: "Orders", icon: "inbox" },
      { href: "/admin/print/qr", label: "QR poster", icon: "qr" },
      { href: "/admin/print/activity", label: "Activity", icon: "activity", lock: "activity" },
    ],
  },
  {
    id: "expenses",
    label: "Expense Tracker",
    icon: "wallet",
    items: [
      { href: "/admin/expenses", label: "Overview", icon: "overview" },
      { href: "/admin/expenses/bookings", label: "Bookings", icon: "bookings" },
      { href: "/admin/expenses/fleet", label: "Vehicles & drivers", icon: "car" },
      { href: "/admin/expenses/repairs", label: "Repairs", icon: "wrench" },
      { href: "/admin/expenses/fastag", label: "FASTag", icon: "tag" },
      { href: "/admin/expenses/emi", label: "EMI & insurance", icon: "shield" },
      { href: "/admin/expenses/reports", label: "Reports", icon: "download" },
      { href: "/admin/expenses/activity", label: "Activity", icon: "activity", lock: "activity" },
    ],
  },
  // Car Bookings (WhatsApp enquiries, app/admin/cars) is hidden from the menu: it's only legal with
  // yellow-plate (commercial) cars. The pages and code are kept; to bring it back, add:
  // { id: "cars", label: "Car Bookings", icon: "car", items: [
  //   { href: "/admin/cars", label: "Overview", icon: "overview" },
  //   { href: "/admin/cars/bookings", label: "Bookings", icon: "bookings" },
  //   { href: "/admin/cars/calendar", label: "Calendar", icon: "calendar" },
  //   { href: "/admin/cars/activity", label: "Activity", icon: "activity" } ] },
];

/** The phone's bottom tabs. `match` decides when a tab is lit; More is lit on every other page. */
export const TABS: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/admin/print", label: "Prints", icon: "printer", match: (p) => p === "/admin/print" },
  { href: "/admin/expenses/bookings", label: "Bookings", icon: "bookings", match: (p) => p.startsWith("/admin/expenses/bookings") },
  { href: "/admin/assistant", label: "Assist", icon: "sparkle", match: (p) => p.startsWith("/admin/assistant") },
  { href: "/admin/expenses", label: "Overview", icon: "overview", match: (p) => p === "/admin/expenses" },
  { href: "/admin/more", label: "More", icon: "more", match: () => false },
];
