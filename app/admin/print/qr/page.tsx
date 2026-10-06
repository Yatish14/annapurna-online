import Icon from "@/components/admin/Icon";
import Lotus from "@/components/admin/Lotus";
import PageHeader from "@/components/admin/PageHeader";
import PrintPosterButton from "@/components/admin/PrintPosterButton";
import { requireUser } from "@/lib/auth";
import { BUSINESS } from "@/lib/config";
import { PRINT_SHOP } from "@/lib/print/files";
import { qrSvg } from "@/lib/print/qr";

export const metadata = { title: "QR poster" };

export default async function QrPosterPage() {
  await requireUser();
  const url = `${PRINT_SHOP.siteUrl}/print`;
  const svg = qrSvg(url);
  const download = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Printout"
        title="Counter QR code"
        subtitle="Print this poster and keep it at the counter. Customers scan it to send their documents."
      >
        <div className="ap-qr-actions">
          <a className="ap-btn ap-btn-ghost" href={download} download="annapurna-print-qr.svg">
            <Icon name="download" size={16} /> Download QR
          </a>
          <PrintPosterButton />
        </div>
      </PageHeader>

      <section className="ap-poster" aria-label="Poster preview">
        <div className="ap-poster-brand">
          <Lotus size={56} />
          <div>
            <strong>Annapurna</strong>
            <span>Graphics and Internet</span>
          </div>
        </div>
        <h2>
          Scan to <em>print</em>
        </h2>
        <p className="ap-poster-lead">Send your documents from your phone. No WhatsApp or email needed.</p>
        <div className="ap-poster-qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <ol className="ap-poster-steps">
          <li>
            <b>1</b> Scan the code
          </li>
          <li>
            <b>2</b> Upload & choose colour, sides, pages
          </li>
          <li>
            <b>3</b> Show your order number here
          </li>
        </ol>
        <p className="ap-poster-url">{url.replace(/^https:\/\//, "")}</p>
        <p className="ap-poster-foot">
          {PRINT_SHOP.name} · {BUSINESS.phoneDisplay}
        </p>
      </section>
    </main>
  );
}
