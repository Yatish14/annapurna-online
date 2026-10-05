import { createHmac, timingSafeEqual } from "node:crypto";
import { markRead } from "@/lib/whatsapp/client";
import { handleMessage, type IncomingMessage } from "@/lib/whatsapp/flow";
import { claimMessage } from "@/lib/whatsapp/session";

export const dynamic = "force-dynamic";

// Messages older than this (e.g. delivered late after an outage) are ignored
const MAX_MESSAGE_AGE_SECONDS = 60 * 60;

/** Meta calls this once when you save the callback URL, to check the verify token */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    expected &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === expected
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function hasValidSignature(body: Buffer, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(body).digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type WebhookPayload = {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: IncomingMessage[];
      };
    }[];
  }[];
};

/** Incoming customer messages (and delivery status updates, which are ignored) */
export async function POST(req: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("WHATSAPP_APP_SECRET is not set — refusing webhook calls");
    return new Response("Server not configured", { status: 500 });
  }

  const body = Buffer.from(await req.arrayBuffer());
  if (!hasValidSignature(body, req.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const ourNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const now = Date.now() / 1000;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (change.field !== "messages" || !value?.messages) continue;
      if (ourNumberId && value.metadata?.phone_number_id !== ourNumberId) continue;

      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));

      for (const msg of value.messages) {
        if (now - Number(msg.timestamp) > MAX_MESSAGE_AGE_SECONDS) continue;
        try {
          if (!(await claimMessage(msg.id))) continue; // duplicate delivery
          await markRead(msg.id).catch(() => {}); // blue ticks are nice-to-have, never fatal
          await handleMessage(msg, names.get(msg.from) ?? null);
        } catch (err) {
          // Still answer 200 below: Meta would otherwise keep re-sending the same message
          console.error(`Failed to handle WhatsApp message ${msg.id}:`, err);
        }
      }
    }
  }

  return new Response("OK", { status: 200 });
}
