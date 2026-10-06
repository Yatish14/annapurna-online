import { deleteOrderFiles, updateOrder } from "@/app/admin/print/actions";
import { PRINT_TABS } from "@/app/admin/filters";
import { formatPhone } from "@/lib/format";
import { COLOR_LABELS, copiesText, fileTypeOf, formatSize, optionsText, SIDES_LABELS } from "@/lib/print/files";
import type { PrintOrder } from "@/lib/print/orders";
import Icon from "./Icon";
import PrintFileButton from "./PrintFileButton";
import SubmitButton from "./SubmitButton";

function ago(ms: number, now: number): string {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

type Props = { order: PrintOrder; back: string; canManage: boolean; now: number };

export default function PrintOrderCard({ order, back, canManage, now }: Props) {
  const statusLabel = PRINT_TABS.find((t) => t.id === order.status)?.label ?? order.status;
  const printedFiles = order.files.filter((f) => f.printed_count > 0).length;
  const storedFiles = order.files.filter((f) => !f.deleted).length;

  return (
    <article className={`ap-card ap-porder is-${order.status}`}>
      <div className="ap-card-head">
        <div className="ap-card-title">
          <span className="ap-porder-no">{order.order_no}</span>
          <span className={`ap-badge is-${order.status}`}>{statusLabel}</span>
        </div>
        <div className="ap-customer">
          {order.customer_name && <strong>{order.customer_name}</strong>}
          {order.phone && <a href={`tel:+91${order.phone}`}>{formatPhone(order.phone)}</a>}
          <span className="ap-muted" title={order.created_ist}>
            <Icon name="clock" size={13} /> {ago(order.created_ms, now)}
          </span>
        </div>
      </div>

      <ul className="ap-pfiles">
        {order.files.map((f) => {
          const type = fileTypeOf(f.file_name);
          return (
            <li key={f.id} className={`ap-pfile ${f.printed_count ? "is-printed" : ""}`}>
              <span className="ap-pfile-icon">
                <Icon name={type?.image ? "image" : "file"} size={18} />
                <small>{f.file_name.split(".").pop()?.slice(0, 4)}</small>
              </span>
              <div className="ap-pfile-main">
                <strong title={f.file_name}>{f.file_name}</strong>
                <span className="ap-muted">
                  {type?.label ?? "File"} · {formatSize(f.size_bytes)}
                </span>
                <div className="ap-chips">
                  <span className={`ap-chip ${f.color === "color" ? "is-color" : "is-bw"}`}>{COLOR_LABELS[f.color]}</span>
                  <span className="ap-chip">{SIDES_LABELS[f.sides]}</span>
                  <span className="ap-chip">{f.page_range ? `Pages ${f.page_range}` : type?.image ? "1 page" : "All pages"}</span>
                  <span className={`ap-chip ${f.copies > 1 ? "is-strong" : ""}`}>{copiesText(f.copies)}</span>
                </div>
                {f.printed_count > 0 && (
                  <span className="ap-by">
                    <Icon name="check" size={13} /> Printed{f.printed_count > 1 ? ` ${f.printed_count}×` : ""} by <strong>{f.printed_by}</strong> · {f.printed_ist}
                  </span>
                )}
              </div>
              {f.deleted ? (
                <span className="ap-pfile-gone">Deleted after 3 days</span>
              ) : (
                <PrintFileButton
                  fileId={f.id}
                  fileName={f.file_name}
                  title={`${order.order_no} · ${f.file_name}`}
                  mode={type?.mode ?? "download"}
                  options={optionsText(f)}
                  canPrint={canManage}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="ap-card-foot">
        <span className="ap-by">
          {order.updated_by ? (
            <>
              <Icon name="shield" size={14} /> {statusLabel} by <strong>{order.updated_by}</strong> · {order.updated_ist}
            </>
          ) : (
            <>
              {printedFiles} of {order.files.length} file{order.files.length === 1 ? "" : "s"} printed · received {order.created_ist}
            </>
          )}
        </span>
        {canManage && (
          <div className="ap-actions">
            {storedFiles > 0 && (
              <form action={deleteOrderFiles}>
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="back" value={back} />
                <SubmitButton
                  className="ap-btn ap-btn-danger ap-btn-sm"
                  title="For example when the customer asks. The order itself is kept."
                  confirm={`Delete the ${storedFiles} file${storedFiles === 1 ? "" : "s"} of ${order.order_no} now? They can't be printed or opened again. The order record is kept.`}
                >
                  <Icon name="trash" size={14} /> Delete files now
                </SubmitButton>
              </form>
            )}
            <form action={updateOrder}>
              <input type="hidden" name="id" value={order.id} />
              <input type="hidden" name="back" value={back} />
              {order.status === "collected" ? (
                <>
                  <input type="hidden" name="action" value="reopen" />
                  <SubmitButton className="ap-btn ap-btn-ghost ap-btn-sm">
                    <Icon name="undo" size={14} /> Undo collected
                  </SubmitButton>
                </>
              ) : (
                <>
                  <input type="hidden" name="action" value="collected" />
                  <SubmitButton
                    className={`ap-btn ap-btn-sm ${order.status === "printed" ? "ap-btn-gold" : "ap-btn-ghost"}`}
                    confirm={order.status === "new" ? `${order.order_no} hasn't been printed yet. Mark it as collected anyway?` : undefined}
                  >
                    <Icon name="bag" size={14} /> Mark collected
                  </SubmitButton>
                </>
              )}
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
