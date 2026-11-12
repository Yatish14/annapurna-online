// What the Annapurna Assist chat page shows. For now the messages come from lib/assistant/sample.ts;
// later the API route (docs/assistant-plan.md, Step 1–2) sends the same shapes, so the UI doesn't change.
import type { IconName } from "@/components/admin/Icon";

/** A tool the assistant ran before answering, shown as a small chip: "Checked bookings" */
export type ToolStep = { label: string; icon: IconName };

export type BookingRow = { no: string; customer: string; vehicle: string; driver: string; dates: string; balance: number };

/** Something richer than text under a reply: a table, numbers, a draft to confirm, a file, or help sources */
export type Card =
  | { kind: "bookings"; title: string; rows: BookingRow[]; link?: { href: string; label: string } }
  | { kind: "stats"; title: string; items: { label: string; value: string; tone?: "green" | "red" | "gold" | "navy" }[] }
  | {
      kind: "draft";
      /** Later: the id of a row in assistant_drafts. The card never carries the data that gets saved. */
      id: string;
      title: string;
      icon: IconName;
      fields: { label: string; value: string }[];
      warning?: string;
      status: "pending" | "confirmed" | "cancelled";
      /** Shown after Confirm, e.g. "Saved as VB-0042" */
      result?: string;
      formHref: string;
    }
  | { kind: "file"; name: string; detail: string; href: string }
  | { kind: "sources"; items: { title: string; section: string }[] };

export type Message = {
  id: string;
  role: "user" | "assistant";
  /** Plain text; **bold**, "- " bullets and "1. " steps are formatted */
  text: string;
  steps?: ToolStep[];
  cards?: Card[];
  /** "10:42 am" */
  time: string;
  /** The question was spoken, not typed */
  voice?: boolean;
  /** The reply was cut short with Stop */
  stopped?: boolean;
  /** Why the reply failed, shown in red under any words that did arrive. Failed replies aren't sent back to the model. */
  error?: string;
};

export type Chat = { id: string; title: string; /** "Today", "Yesterday", "12 Oct" */ when: string; messages: Message[] };

/** A reply before it gets an id and a time */
export type Reply = Pick<Message, "text" | "steps" | "cards">;

/**
 * What /api/assistant sends while it answers: one of these as JSON on each line (NDJSON).
 * - text: more words of the answer
 * - step: a tool started ("running") or finished ("done"); `id` pairs the two when several run at once
 * - card: a table or other card made from a finished tool's own result (lib/assistant/cards.ts)
 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "step"; state: "running" | "done"; id: string; step: ToolStep }
  | { type: "card"; card: Card };
