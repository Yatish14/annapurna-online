import Link from "next/link";
import { after } from "next/server";
import AutoRefresh from "@/components/admin/AutoRefresh";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import PrintOrderCard from "@/components/admin/PrintOrderCard";
import SubmitButton from "@/components/admin/SubmitButton";
import { can, requireUser } from "@/lib/auth";
import { cleanupIfDue } from "@/lib/print/cleanup";
import { PRINT_SHOP } from "@/lib/print/files";
import { isAccepting, listOrders, printStats } from "@/lib/print/orders";
import { storageReady } from "@/lib/print/storage";
import { parsePrintStatus, printHref, PRINT_TABS, readParams, type SearchParams } from "../filters";
import { setUploads } from "./actions";

export const metadata = { title: "Print orders" };

const EMPTY: Record<string, string> = {
  new: "No new orders. When a customer scans the QR code and sends files, they'll appear here with a chime.",
  printed: "Nothing waiting for collection.",
  collected: "No collected orders yet.",
  all: "No orders yet.",
};

export default async function PrintOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const canManage = can(user, "managePrints");
  const params = await readParams(searchParams);
  const status = parsePrintStatus(params);
  const back = printHref(status);

  const [stats, orders, accepting] = await Promise.all([printStats(), listOrders(status), isAccepting()]);
  // Delete files older than 3 days (at most once an hour), after the page has been sent
  after(cleanupIfDue);
  const now = Date.now();

  return (
    <main className="ap-page">
      <AutoRefresh seconds={15} count={stats.new} />
      <PageHeader eyebrow="Printout" title="Print orders" subtitle="Documents customers sent by scanning the QR code at the counter.">
        <div className={`ap-uploads ${accepting ? "is-on" : "is-off"}`}>
          <span className="ap-uploads-state">
            <i aria-hidden="true" /> {accepting ? "Accepting uploads" : "Uploads paused"}
          </span>
          {canManage && (
            <form action={setUploads}>
              <input type="hidden" name="on" value={accepting ? "0" : "1"} />
              <input type="hidden" name="back" value={back} />
              <SubmitButton
                className="ap-btn ap-btn-ghost ap-btn-sm"
                confirm={accepting ? "Pause uploads? Customers will be asked to come to the counter instead." : undefined}
              >
                <Icon name={accepting ? "pause" : "play"} size={13} /> {accepting ? "Pause" : "Resume"}
              </SubmitButton>
            </form>
          )}
        </div>
      </PageHeader>
      <Flash params={params} />

      {!storageReady() && (
        <p className="ap-alert ap-alert-error">
          File storage isn't connected, so customers can't upload yet. In Vercel, open the project → Storage → create a Blob store
          (private) and connect it to this project, then redeploy. See README.md.
        </p>
      )}

      <section className="ap-panel">
        <div className="ap-toolbar">
          <nav className="ap-tabs" aria-label="Status">
            {PRINT_TABS.map((t) => (
              <Link key={t.id} href={printHref(t.id)} scroll={false} className={status === t.id ? "is-active" : ""}>
                {t.label}
                <span className="ap-count">
                  <LinkPending>{stats[t.id]}</LinkPending>
                </span>
              </Link>
            ))}
          </nav>
          <span className="ap-muted ap-toolbar-note">
            <Icon name="clock" size={14} /> Files are deleted {PRINT_SHOP.keepDays} days after upload
          </span>
        </div>

        {!canManage && (
          <p className="ap-note ap-note-warn">
            <Icon name="eye" size={14} /> View only: you can open files, but printing and marking orders is for admins.
          </p>
        )}

        {orders.length === 0 ? (
          <div className="ap-empty">
            <Icon name="printer" size={32} />
            <p>{EMPTY[status]}</p>
          </div>
        ) : (
          <div className="ap-list">
            {orders.map((o) => (
              <PrintOrderCard key={o.id} order={o} back={back} canManage={canManage} now={now} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
