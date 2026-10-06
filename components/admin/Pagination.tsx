import Link from "next/link";
import { pageItems, type PageItem } from "@/lib/pagination";
import LinkPending from "./LinkPending";

type Props = {
  page: number;
  totalPages: number;
  /** URL of a page number (keeps the list's other filters) */
  href: (page: number) => string;
  /** e.g. "Page 3 of 12 · 118 orders" */
  summary: string;
};

function Buttons({ items, page, href, className }: { items: PageItem[]; page: number; href: Props["href"]; className: string }) {
  return (
    <div className={className}>
      {items.map((item, i) =>
        item === "gap" ? (
          <span key={`gap${i}`} className="ap-page-gap" aria-hidden="true">
            …
          </span>
        ) : item === page ? (
          <span key={item} className="ap-pgbtn is-current" aria-current="page">
            {item}
          </span>
        ) : (
          <Link key={item} href={href(item)} className="ap-pgbtn" aria-label={`Page ${item}`}>
            <LinkPending>{item}</LinkPending>
          </Link>
        ),
      )}
    </div>
  );
}

/**
 * Numbered page buttons. Long lists are shortened with "…" (1 … 66 67 68 … 100), using fewer
 * buttons on phones, so the row always fits.
 */
export default function Pagination({ page, totalPages, href, summary }: Props) {
  if (totalPages <= 1) return null;
  return (
    <nav className="ap-pagination" aria-label="Pages">
      <span className="ap-muted">{summary}</span>
      <Buttons items={pageItems(page, totalPages, 1)} page={page} href={href} className="ap-pages is-wide" />
      <Buttons items={pageItems(page, totalPages, 0)} page={page} href={href} className="ap-pages is-narrow" />
    </nav>
  );
}
