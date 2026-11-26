"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { TABS } from "./nav";

/**
 * Phones and tablets: the bottom tab bar, in place of the desktop sidebar (hidden on desktop, admin-mobile.css).
 * Annapurna Assist is the raised gold button in the middle; Prints shows how many new orders are waiting.
 */
export default function TabBar({ printCount }: { printCount: number }) {
  const pathname = usePathname();
  // The first tab that claims this page; if none does, the page is one of More's
  const active = TABS.find((t) => t.match(pathname))?.href ?? "/admin/more";

  return (
    <nav className="ap-tabbar" aria-label="Main">
      {TABS.map((t) => {
        const isActive = t.href === active;
        const isAssist = t.href === "/admin/assistant";
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`ap-tab ${isAssist ? "ap-tab-assist" : ""} ${isActive ? "is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="ap-tab-icon">
              <Icon name={t.icon} size={isAssist ? 26 : 23} />
              {t.href === "/admin/print" && printCount > 0 && (
                <span className="ap-tab-badge" aria-label={`${printCount} new`}>
                  {printCount > 99 ? "99+" : printCount}
                </span>
              )}
            </span>
            <span className="ap-tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
