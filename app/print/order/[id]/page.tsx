import Link from "next/link";
import { notFound } from "next/navigation";
import AutoRefresh from "@/components/admin/AutoRefresh";
import Icon from "@/components/admin/Icon";
import Confetti from "@/components/print/Confetti";
import { fileTypeOf, formatSize, optionsText, PRINT_SHOP } from "@/lib/print/files";
import { getOrderByPublicId, type PrintStatus } from "@/lib/print/orders";

export const metadata = { title: "Your order" };

const STATUS: Record<PrintStatus, { label: string; text: string }> = {
  new: { label: "Waiting to print", text: "We've received your files. Show the order number at the counter." },
  printed: { label: "Printed", text: "Your printouts are ready. Show the order number at the counter to collect them." },
  collected: { label: "Collected", text: "You've collected this order. Thank you!" },
};

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OrderPage({ params, searchParams }: Props) {
  const order = await getOrderByPublicId((await params).id);
  if (!order) notFound();
  const justSent = (await searchParams).new === "1";
  const status = STATUS[order.status];
  const copies = order.files.reduce((sum, f) => sum + f.copies, 0);

  return (
    <main className="pp-main pp-done">
      {justSent && <Confetti />}
      {order.status !== "collected" && <AutoRefresh seconds={20} />}

      <section className="pp-card pp-ticket">
        <span className="pp-check" aria-hidden="true">
          <Icon name="check" size={30} />
        </span>
        <h1>{justSent ? "Sent for printing!" : "Your print order"}</h1>
        <p className="pp-ticket-lead">Show this order number at the counter</p>

        <div className="pp-orderno" aria-label={`Order number ${order.order_no}`}>
          {order.order_no}
        </div>

        <span className={`pp-status is-${order.status}`}>
          <i aria-hidden="true" /> {status.label}
        </span>
        <p className="pp-ticket-text">{status.text}</p>
        <p className="pp-ticket-hint">Tip: take a screenshot of this page.</p>
      </section>

      <section className="pp-card">
        <div className="pp-summary-head">
          <h2>
            {order.files.length} file{order.files.length === 1 ? "" : "s"}
          </h2>
          <span>
            {copies} cop{copies === 1 ? "y" : "ies"} in total
          </span>
        </div>
        <ul className="pp-summary">
          {order.files.map((f) => (
            <li key={f.id}>
              <span className="pp-thumb pp-thumb-doc">
                <Icon name={fileTypeOf(f.file_name)?.image ? "image" : "file"} size={18} />
              </span>
              <div>
                <strong>{f.file_name}</strong>
                <span>{optionsText(f)}</span>
                <small>{formatSize(f.size_bytes)}</small>
              </div>
            </li>
          ))}
        </ul>
        <p className="pp-summary-foot">
          Sent {order.created_ist}
          {order.customer_name ? ` by ${order.customer_name}` : ""}. Your files are private and deleted automatically after {PRINT_SHOP.keepDays} days. Want them deleted sooner? Ask at the counter.
        </p>
      </section>

      <Link href="/print" className="pp-btn pp-btn-ghost pp-btn-block">
        <Icon name="plus" size={18} /> Print more documents
      </Link>
    </main>
  );
}
