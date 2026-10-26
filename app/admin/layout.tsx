import type { Metadata } from "next";
import { cookies } from "next/headers";
import Sidebar from "@/components/admin/Sidebar";
import { MODULES_COOKIE, parseOpenModules, SIDEBAR_COOKIE } from "@/components/admin/sidebarCookie";
import AssistPanel from "@/components/assistant/AssistPanel";
import AssistProvider from "@/components/assistant/AssistProvider";
import { sampleChats } from "@/lib/assistant/sample";
import { can, requireUser, ROLE_LABELS } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { initials } from "@/lib/format";
import { printStats } from "@/lib/print/orders";
import "../admin.css";

export const metadata: Metadata = {
  title: { default: "Admin · Annapurna", template: "%s · Annapurna Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [prints, store] = await Promise.all([printStats(), cookies()]);
  const today = todayIST();

  // Annapurna Assist looks the same for every role. Viewers can read it, but its buttons are
  // greyed out for them (canUse); the chats live here, above every page, so the side panel and
  // the full page share them and they stay while you move between pages.
  return (
    <AssistProvider
      firstName={user.name.split(" ")[0]}
      today={today}
      canUse={can(user, "useAssistant")}
      initialChats={sampleChats(today)}
    >
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
          showUsers={can(user, "viewUsers")}
          showActivity={can(user, "viewActivity")}
          initialCollapsed={store.get(SIDEBAR_COOKIE)?.value === "collapsed"}
          initialOpen={parseOpenModules(store.get(MODULES_COOKIE)?.value)}
        />
        <div className="ap-content">{children}</div>
        <AssistPanel />
      </div>
    </AssistProvider>
  );
}
