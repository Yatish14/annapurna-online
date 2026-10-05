"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/login/actions";
import Icon, { type IconName } from "./Icon";
import LinkPending from "./LinkPending";
import Lotus from "./Lotus";
import { SIDEBAR_COOKIE } from "./sidebarCookie";

type Props = {
  user: { name: string; mobile: string; role: string; roleLabel: string; initials: string };
  pendingCount: number;
  showUsers: boolean;
  showActivity: boolean;
  /** Desktop: start with the icon-only sidebar (remembered in a cookie) */
  initialCollapsed: boolean;
};

export default function Sidebar({ user, pendingCount, showUsers, showActivity, initialCollapsed }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(initialCollapsed); // desktop icon-only mode

  // Close the mobile drawer after navigating
  useEffect(() => setOpen(false), [pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  const items: { href: string; label: string; icon: IconName; badge?: number }[] = [
    { href: "/admin", label: "Overview", icon: "overview" },
    { href: "/admin/bookings", label: "Bookings", icon: "bookings", badge: pendingCount },
    { href: "/admin/calendar", label: "Calendar", icon: "calendar" },
    ...(showActivity ? [{ href: "/admin/activity", label: "Activity", icon: "activity" as const }] : []),
    ...(showUsers ? [{ href: "/admin/users", label: "Users & roles", icon: "users" as const }] : []),
  ];
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  return (
    <>
      <header className="ap-mobilebar">
        <button type="button" className="ap-iconbtn" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
        <div className="ap-mobilebar-brand">
          <Lotus size={28} />
          <strong>Annapurna</strong>
        </div>
        <span className="ap-avatar ap-avatar-sm">{user.initials}</span>
      </header>

      <div className={`ap-scrim ${open ? "is-open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <aside
        className={`ap-side ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
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
          <button type="button" className="ap-iconbtn ap-side-close" aria-label="Close menu" onClick={() => setOpen(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="ap-nav">
          <span className="ap-nav-label">Menu</span>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? "is-active" : ""}
              title={collapsed ? item.label : undefined}
            >
              <span className="ap-nav-icon">
                <Icon name={item.icon} />
                {item.badge ? <span className="ap-nav-dot" aria-hidden="true" /> : null}
              </span>
              <span className="ap-nav-text">{item.label}</span>
              <LinkPending>{item.badge ? <span className="ap-nav-badge">{item.badge}</span> : null}</LinkPending>
            </Link>
          ))}
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
    </>
  );
}
