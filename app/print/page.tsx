import { connection } from "next/server";
import Icon from "@/components/admin/Icon";
import Uploader from "@/components/print/Uploader";
import { PRINT_SHOP } from "@/lib/print/files";
import { isAccepting } from "@/lib/print/orders";
import { storageReady } from "@/lib/print/storage";

export const metadata = { title: { absolute: `Print your documents · ${PRINT_SHOP.name}` } };

const STEPS = [
  { icon: "file" as const, text: "Choose your files" },
  { icon: "printer" as const, text: "Pick colour, sides & pages" },
  { icon: "bag" as const, text: "Show your order number at the counter" },
];

export default async function PrintPage() {
  await connection(); // always check the current settings, never a cached copy
  const open = storageReady() && (await isAccepting());

  return (
    <main className="pp-main">
      <section className="pp-hero">
        <span className="pp-eyebrow">{PRINT_SHOP.name}</span>
        <h1>
          Print from <em>your phone</em>
        </h1>
        <p>Send your documents here, then collect the printouts at the counter. No WhatsApp, no email, no waiting.</p>
        <ol className="pp-steps">
          {STEPS.map((s, i) => (
            <li key={s.text}>
              <span>
                <Icon name={s.icon} size={18} />
              </span>
              <b>{i + 1}</b> {s.text}
            </li>
          ))}
        </ol>
      </section>

      {open ? (
        <Uploader />
      ) : (
        <section className="pp-card pp-closed">
          <Icon name="pause" size={28} />
          <h2>We're not taking uploads right now</h2>
          <p>Please ask at the counter. We'll be happy to help you print your documents.</p>
        </section>
      )}
    </main>
  );
}
