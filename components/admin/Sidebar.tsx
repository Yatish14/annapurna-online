"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import Icon, { type IconName } from "./Icon";
import LinkPending from "./LinkPending";
import Lotus from "./Lotus";
import { MODULES_COOKIE, SIDEBAR_COOKIE, type ModuleId } from "./sidebarCookie";

type Props = {
  user: { name: string; mobile: string; role: string; roleLabel: string; initials: string };
  /** New print orders */
  printCount: number;
  showUsers: boolean;
  showActivity: boolean;
  /** Desktop: start with the icon-only sidebar (remembered in a cookie) */
  initialCollapsed: boolean;
  /** Modules that were left open (remembered in a cookie) */
  initialOpen: ModuleId[];
};

type Item = { href: string; label: string; icon: IconName; badge?: number };
type Module = { id: ModuleId; label: string; icon: IconName; items: Item[] };

// Module home pages are only "active" on exactly their own URL
const EXACT = new Set(["/admin/print", "/admin/expenses"]);

const isDesktop = () => window.matchMedia("(min-width: 1001px)").matches;

export default function Sidebar(props: Props) {
  const { user, printCount, showUsers, showActivity, initialCollapsed, initialOpen } = props;
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(initialCollapsed); // desktop icon-only mode
  const [flyout, setFlyout] = useState<{ id: ModuleId; top: number; left: number } | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  const modules: Module[] = [
    {
      id: "print",
      label: "Printout",
      icon: "printer",
      items: [
        { href: "/admin/print", label: "Orders", icon: "inbox", badge: printCount },
        { href: "/admin/print/qr", label: "QR poster", icon: "qr" },
        ...(showActivity ? [{ href: "/admin/print/activity", label: "Activity", icon: "activity" as const }] : []),
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
        ...(showActivity ? [{ href: "/admin/expenses/activity", label: "Activity", icon: "activity" as const }] : []),
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

  const isActive = (href: string) => (EXACT.has(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const activeModule = modules.find((m) => m.items.some((i) => isActive(i.href)))?.id;

  // The module of the current page is always open
  const [open, setOpen] = useState<ModuleId[]>(() =>
    activeModule && !initialOpen.includes(activeModule) ? [...initialOpen, activeModule] : initialOpen,
  );

  useEffect(() => {
    setDrawer(false);
    setFlyout(null);
    if (activeModule) setOpen((ids) => (ids.includes(activeModule) ? ids : [...ids, activeModule]));
  }, [pathname, activeModule]);

  // Close the collapsed-mode pop-out on outside click or Escape
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!flyoutRef.current?.contains(target) && !target.closest?.(".ap-mod-head")) setFlyout(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFlyout(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [flyout]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    setFlyout(null);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  function onModuleClick(m: Module, button: HTMLButtonElement) {
    if (collapsed && isDesktop()) {
      const rect = button.getBoundingClientRect();
      setFlyout((f) => (f?.id === m.id ? null : { id: m.id, top: rect.top, left: rect.right + 12 }));
      return;
    }
    const next = open.includes(m.id) ? open.filter((id) => id !== m.id) : [...open, m.id];
    setOpen(next);
    document.cookie = `${MODULES_COOKIE}=${next.join("-") || "none"}; path=/; max-age=31536000; samesite=lax`;
  }

  const link = (item: Item, inFlyout = false) => (
    <Link
      key={item.href}
      href={item.href}
      className={isActive(item.href) ? "is-active" : ""}
      title={collapsed && !inFlyout ? item.label : undefined}
    >
      <span className="ap-nav-icon">
        <Icon name={item.icon} />
        {item.badge ? <span className="ap-nav-dot" aria-hidden="true" /> : null}
      </span>
      <span className="ap-nav-text">{item.label}</span>
      <LinkPending>{item.badge ? <span className="ap-nav-badge">{item.badge}</span> : null}</LinkPending>
    </Link>
  );

  const flyoutModule = flyout && modules.find((m) => m.id === flyout.id);

  return (
    <>
      <header className="ap-mobilebar">
        <button type="button" className="ap-iconbtn" aria-label="Open menu" onClick={() => setDrawer(true)}>
          <Icon name="menu" size={22} />
        </button>
        <div className="ap-mobilebar-brand">
          <Lotus size={28} />
          <strong>Annapurna</strong>
        </div>
        <span className="ap-avatar ap-avatar-sm">{user.initials}</span>
      </header>

      <div className={`ap-scrim ${drawer ? "is-open" : ""}`} onClick={() => setDrawer(false)} aria-hidden="true" />

      <aside
        className={`ap-side ${drawer ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Dashboard navigation"
      >
        <div className="ap-side-brand">
          <Lotus size={38} />
          <div className="ap-side-brandtext">
            <strong>Annapurna</strong>
            <span>Admin console</span>
          </div>
          <button
            type="button"
            className="ap-iconbtn ap-side-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            <Icon name="collapse" size={19} />
          </button>
          <button type="button" className="ap-iconbtn ap-side-close" aria-label="Close menu" onClick={() => setDrawer(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="ap-nav">
          <span className="ap-nav-label">Modules</span>
          {modules.map((m) => {
            const isOpen = open.includes(m.id);
            const badge = m.items.reduce((sum, i) => sum + (i.badge ?? 0), 0);
            return (
              <div
                key={m.id}
                className={`ap-mod ${isOpen ? "is-open" : ""} ${activeModule === m.id ? "has-active" : ""} ${flyout?.id === m.id ? "is-flyout" : ""}`}
              >
                <button
                  type="button"
                  className="ap-mod-head"
                  aria-expanded={collapsed ? flyout?.id === m.id : isOpen}
                  aria-controls={`ap-mod-${m.id}`}
                  title={collapsed ? m.label : undefined}
                  onClick={(e) => onModuleClick(m, e.currentTarget)}
                >
                  <span className="ap-nav-icon">
                    <Icon name={m.icon} />
                    {badge ? <span className="ap-nav-dot" aria-hidden="true" /> : null}
                  </span>
                  <span className="ap-nav-text">{m.label}</span>
                  {!isOpen && badge ? <span className="ap-nav-badge">{badge}</span> : null}
                  <Icon name="chevron" size={16} className="ap-mod-chevron" />
                </button>
                <div className="ap-mod-items" id={`ap-mod-${m.id}`}>
                  <div>{m.items.map((item) => link(item))}</div>
                </div>
              </div>
            );
          })}

          {showUsers && (
            <div className={`ap-mod ap-mod-single ${isActive("/admin/users") ? "has-active" : ""}`}>
              {link({ href: "/admin/users", label: "Users & roles", icon: "users" })}
            </div>
          )}
        </nav>

        <div className="ap-side-foot">
          <Link
            href="/admin/account"
            className={`ap-me ${isActive("/admin/account") ? "is-active" : ""}`}
            title={collapsed ? `${user.name} · ${user.roleLabel} · My account` : "My account"}
          >
            <span className="ap-avatar">{user.initials}</span>
            <div className="ap-me-text">
              <strong>{user.name}</strong>
              <span className={`ap-role is-${user.role}`}>{user.roleLabel}</span>
            </div>
          </Link>
          <form action={logout}>
            <button type="submit" className="ap-logout" title={collapsed ? "Log out" : undefined}>
              <Icon name="logout" size={17} /> <span className="ap-logout-text">Log out</span>
            </button>
          </form>
        </div>
      </aside>

      {flyout && flyoutModule && (
        <div
          ref={flyoutRef}
          className="ap-flyout"
          style={{ top: Math.min(flyout.top, window.innerHeight - 60 - flyoutModule.items.length * 46), left: flyout.left }}
          role="menu"
          aria-label={flyoutModule.label}
        >
          <span className="ap-flyout-title">{flyoutModule.label}</span>
          <nav className="ap-nav">{flyoutModule.items.map((item) => link(item, true))}</nav>
        </div>
      )}
    </>
  );
}
