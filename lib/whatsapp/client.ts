// Thin wrapper around the WhatsApp Cloud API "send message" endpoint.

export class WhatsAppError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

export type Button = { id: string; title: string };
export type ListRow = { id: string; title: string; description?: string };

// WhatsApp rejects messages whose fields are longer than these limits
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const FOOTER = "Annapurna Tours & Travels";

async function send(payload: Record<string, unknown>): Promise<void> {
  const body = { messaging_product: "whatsapp", ...payload };

  if (process.env.WHATSAPP_DRY_RUN === "1") {
    console.log("[whatsapp dry-run]", JSON.stringify(body));
    return;
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new WhatsAppError("WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set");

  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const err = data?.error;
    throw new WhatsAppError(err?.error_user_msg || err?.message || `WhatsApp API returned HTTP ${res.status}`, err?.code);
  }
}

export function sendText(to: string, text: string) {
  return send({ to, type: "text", text: { body: clip(text, 4096), preview_url: false } });
}

/** Up to 3 tap-to-reply buttons */
export function sendButtons(to: string, text: string, buttons: Button[]) {
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: clip(text, 1024) },
      footer: { text: FOOTER },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } })),
      },
    },
  });
}

/** A "Select …" button that opens a list of up to 10 options */
export function sendList(to: string, text: string, buttonLabel: string, sectionTitle: string, rows: ListRow[]) {
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: clip(text, 1024) },
      footer: { text: FOOTER },
      action: {
        button: clip(buttonLabel, 20),
        sections: [
          {
            title: clip(sectionTitle, 24),
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: clip(r.title, 24),
              ...(r.description ? { description: clip(r.description, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}

/** An approved message template (needed when the customer's last message was over 24 hours ago) */
export function sendTemplate(to: string, name: string, bodyParams: string[]) {
  return send({
    to,
    type: "template",
    template: {
      name,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
      components: [
        {
          type: "body",
          // Template values may not contain new lines or long runs of spaces
          parameters: bodyParams.map((p) => ({ type: "text", text: p.replace(/\s+/g, " ").trim() || "-" })),
        },
      ],
    },
  });
}

/** Shows blue ticks on the customer's message */
export function markRead(messageId: string) {
  return send({ status: "read", message_id: messageId });
}
