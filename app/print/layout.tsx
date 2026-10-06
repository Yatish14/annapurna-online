import type { Metadata } from "next";
import Link from "next/link";
import Lotus from "@/components/admin/Lotus";
import { BUSINESS } from "@/lib/config";
import { PRINT_SHOP } from "@/lib/print/files";
import "../print.css";

export const metadata: Metadata = {
  title: { default: `Print your documents · ${PRINT_SHOP.name}`, template: `%s · ${PRINT_SHOP.name}` },
  description: "Upload documents from your phone and collect the printouts at the counter.",
  robots: { index: false, follow: false },
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pp-shell">
      <header className="pp-top">
        <Link href="/print" className="pp-brand">
          <Lotus size={40} />
          <span>
            <strong>Annapurna</strong>
            <small>Graphics and Internet</small>
          </span>
        </Link>
        <a className="pp-call" href={`tel:+91${BUSINESS.phone}`} aria-label={`Call ${BUSINESS.phoneDisplay}`}>
          <PhoneIcon /> <span>{BUSINESS.phoneDisplay}</span>
        </a>
      </header>
      {children}
      <footer className="pp-foot">
        {PRINT_SHOP.name} · Files are deleted automatically {PRINT_SHOP.keepDays} days after upload.
      </footer>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}
