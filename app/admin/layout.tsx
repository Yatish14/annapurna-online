import type { Metadata } from "next";
import { cookies } from "next/headers";
import Sidebar from "@/components/admin/Sidebar";
import { SIDEBAR_COOKIE } from "@/components/admin/sidebarCookie";
import { can, requireUser, ROLE_LABELS } from "@/lib/auth";
import { dashboardStats } from "@/lib/bookings";
import { initials } from "@/lib/format";
import "../admin.css";

export const metadata: Metadata = {
  title: { default: "Admin · Annapurna", template: "%s · Annapurna Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const stats = await dashboardStats();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

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
        pendingCount={stats.pending}
        showUsers={can(user, "viewUsers")}
        showActivity={can(user, "viewActivity")}
        initialCollapsed={collapsed}
      />
      <div className="ap-content">{children}</div>
    </div>
  );
}
