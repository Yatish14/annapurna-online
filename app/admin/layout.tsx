import type { Metadata } from "next";
import { cookies } from "next/headers";
import Sidebar from "@/components/admin/Sidebar";
import { MODULES_COOKIE, parseOpenModules, SIDEBAR_COOKIE } from "@/components/admin/sidebarCookie";
import { can, requireUser, ROLE_LABELS } from "@/lib/auth";
import { dashboardStats } from "@/lib/bookings";
import { initials } from "@/lib/format";
import { printStats } from "@/lib/print/orders";
import "../admin.css";

export const metadata: Metadata = {
  title: { default: "Admin · Annapurna", template: "%s · Annapurna Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [stats, prints, store] = await Promise.all([dashboardStats(), printStats(), cookies()]);

  return (
    <div className="ap-shell">
      <Sidebar
        user={{
          name: user.name,
          mobile: user.mobile,
          role: user.role,
          roleLabel: ROLE_LABELS[user.role],
          initials: initials(user.name),
        }}
        printCount={prints.new}
        pendingCount={stats.pending}
        showUsers={can(user, "viewUsers")}
        showActivity={can(user, "viewActivity")}
        initialCollapsed={store.get(SIDEBAR_COOKIE)?.value === "collapsed"}
        initialOpen={parseOpenModules(store.get(MODULES_COOKIE)?.value)}
      />
      <div className="ap-content">{children}</div>
    </div>
  );
}
