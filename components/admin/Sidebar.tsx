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
      <header className="ad-mobilebar">
        <button type="button" className="ad-iconbtn" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
        <div className="ad-mobilebar-brand">
          <Lotus size={28} />
          <strong>Annapurna</strong>
        </div>
        <span className="ad-avatar ad-avatar-sm">{user.initials}</span>
      </header>

      <div className={`ad-scrim ${open ? "is-open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <aside
        className={`ad-side ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Dashboard navigation"
      >
        <div className="ad-side-brand">
          <Lotus size={38} />
          <div className="ad-side-brandtext">
            <strong>Annapurna</strong>
            <span>Admin console</span>
          </div>
          <button
            type="button"
            className="ad-iconbtn ad-side-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            <Icon name="collapse" size={19} />
          </button>
          <button type="button" className="ad-iconbtn ad-side-close" aria-label="Close menu" onClick={() => setOpen(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="ad-nav">
          <span className="ad-nav-label">Menu</span>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? "is-active" : ""}
              title={collapsed ? item.label : undefined}
            >
              <span className="ad-nav-icon">
                <Icon name={item.icon} />
                {item.badge ? <span className="ad-nav-dot" aria-hidden="true" /> : null}
              </span>
              <span className="ad-nav-text">{item.label}</span>
              <LinkPending>{item.badge ? <span className="ad-nav-badge">{item.badge}</span> : null}</LinkPending>
            </Link>
          ))}
        </nav>

        <div className="ad-side-foot">
          <Link
            href="/admin/account"
            className={`ad-me ${isActive("/admin/account") ? "is-active" : ""}`}
            title={collapsed ? `${user.name} · ${user.roleLabel} · My account` : "My account"}
          >
            <span className="ad-avatar">{user.initials}</span>
            <div className="ad-me-text">
              <strong>{user.name}</strong>
              <span className={`ad-role is-${user.role}`}>{user.roleLabel}</span>
            </div>
          </Link>
          <form action={logout}>
            <button type="submit" className="ad-logout" title={collapsed ? "Log out" : undefined}>
              <Icon name="logout" size={17} /> <span className="ad-logout-text">Log out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
