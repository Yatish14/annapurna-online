import { AIMessage, type BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

/**
 * Phone numbers never go to the model (Step 9, after privacy-first mode): what an admin TYPES still went to Google
 * as typed, so "book Ravi, 98480 22338" sent the number. Now every Indian phone number in what the model gets is
 * swapped for a label, "[phone 1]", and swapped back by our code wherever the label comes out again:
 *
 *   admin types 98480 22338 → the model reads "[phone 1]" → calls draft_booking with customer_phone "[phone 1]"
 *   → the tools node puts 9848022338 back before the tool runs → the draft, the card and the saved chat have the
 *   real number; the answer's words are unmasked as they stream, so the admin never sees a label.
 *
 * Labels are numbered in the order the numbers first appear in the messages, so the same messages always give
 * the same labels: the graph's model step and tools step, and the route showing the answer, each work them out
 * from the same messages and agree, with nothing kept anywhere else.
 *
 * What counts as a phone number (tests/phones.spec.ts has every case):
 * - a mobile: 10 digits starting 6-9, alone or after +91 / 91 / 0: "9848022338", "98480 22338", "+91 98480-22338",
 *   "919848022338", "(+91) 98480.22338", "0 98480 22338", even "9 8 4 8 0 2 2 3 3 8"
 * - a landline with its 0: "040-2345 6789"
 * - digits may be split by spaces, hyphens, dots and brackets, never commas (₹1,20,000 is an amount); Telugu and
 *   Hindi digits count too
 * - not: dates (2026-11-19), amounts (15000, or "15000 20000": two amounts, not a phone starting 1), VB-0012
 * Numbers in words ("nine eight four…") or split over two messages can't be caught: that's why, in privacy-first
 * mode, the customer's phone for a new booking is typed on the draft card (9.5).
 */

/**
 * Telugu and Devanagari digits as 0-9. Each is one character, so positions in the text don't move. Their zeros are
 * U+0C66 and U+0966, so a digit's value is its code minus its zero's.
 */
function toAscii(text: string): string {
  return text
    .replace(/[౦-౯]/g, (d) => String(d.charCodeAt(0) - 0x0c66))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/** The number as our forms keep it: a mobile's 10 digits, a landline's digits with its 0; null if it's not one */
export function phoneOf(digits: string): string | null {
  const mobile = /^(?:91|0)?([6-9]\d{9})$/.exec(digits);
  if (mobile) return mobile[1];
  if (/^0[1-9]\d{9}$/.test(digits)) return digits; // landline: 0 + area code + number, 11 digits
  return null;
}

/** Text between two groups of digits that still joins them into one number: a few spaces, hyphens, dots, brackets */
const JOINER = /^[ \t().-]{1,3}$/;

type Found = { start: number; end: number; phone: string };

/** Every phone number in a text, with where it is. The text's digits are already 0-9 (toAscii). */
function findIn(text: string): Found[] {
  // Groups of digits (a + may start one), each with where it is
  const groups = [...text.matchAll(/\+?\d+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, digits: m[0].replace("+", "") }));
  const found: Found[] = [];
  let i = 0;
  while (i < groups.length) {
    // The longest run of joined groups from here that makes a phone number
    let best: { j: number; phone: string } | null = null;
    let digits = "";
    for (let j = i; j < groups.length; j++) {
      if (j > i && !JOINER.test(text.slice(groups[j - 1].end, groups[j].start))) break;
      digits += groups[j].digits;
      if (digits.length > 13) break;
      const phone = phoneOf(digits);
      if (phone) best = { j, phone };
    }
    if (!best) {
      i++;
      continue;
    }
    let start = groups[i].start;
    const end = groups[best.j].end;
    // "(+91) 98480 22338": the bracket before goes too, when its partner is inside
    if (text[start - 1] === "(" && text.slice(start, end).includes(")")) start--;
    found.push({ start, end, phone: best.phone });
    i = best.j + 1;
  }
  return found;
}

/** Every phone number in a text, as our forms keep them, in order */
export function findPhones(text: string): string[] {
  return findIn(toAscii(text)).map((f) => f.phone);
}

/** "[phone 1]"; also matched without its brackets or with an underscore, as models sometimes write it */
const label = (n: number) => `[phone ${n}]`;
const LABEL_IN_TEXT = /\[\s*phone[\s_]*(\d+)\s*\]/gi;
const LABEL_LOOSE = /\[\s*phone[\s_]*(\d+)\s*\]|\bphone[\s_]*(\d+)\b/gi;

/** The labels for one run of the assistant: built up from the messages, in order */
export class PhoneBook {
  private labels = new Map<string, number>();
  private phones: string[] = [];

  /** The text with each phone number swapped for its label (new numbers get the next label) */
  mask(text: string): string {
    const plain = toAscii(text);
    const found = findIn(plain);
    if (!found.length) return text;
    let out = "";
    let at = 0;
    for (const f of found) {
      let n = this.labels.get(f.phone);
      if (n === undefined) {
        this.phones.push(f.phone);
        n = this.phones.length;
        this.labels.set(f.phone, n);
      }
      out += plain.slice(at, f.start) + label(n);
      at = f.end;
    }
    return out + plain.slice(at);
  }

  /** The text with the labels this book knows swapped back (unknown ones are left: nothing to put back) */
  unmask(text: string, pattern: RegExp = LABEL_IN_TEXT): string {
    return text.replace(pattern, (whole, a?: string, b?: string) => this.phones[Number(a ?? b) - 1] ?? whole);
  }

  /** A tool call's inputs with the labels swapped back, in any text inside them (loosely: "phone 1" too) */
  unmaskArgs<T>(value: T): T {
    if (typeof value === "string") return this.unmask(value, LABEL_LOOSE) as T;
    if (Array.isArray(value)) return value.map((v) => this.unmaskArgs(v)) as T;
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.unmaskArgs(v)])) as T;
    }
    return value;
  }

  private maskArgs<T>(value: T): T {
    if (typeof value === "string") return this.mask(value) as T;
    if (Array.isArray(value)) return value.map((v) => this.maskArgs(v)) as T;
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.maskArgs(v)])) as T;
    }
    return value;
  }

  /** A message's content, masked (text parts only; anything else, like Gemini's signatures, is kept as it is) */
  private maskContent(content: BaseMessage["content"]): BaseMessage["content"] {
    if (typeof content === "string") return this.mask(content);
    return content.map((part) =>
      part && typeof part === "object" && "type" in part && part.type === "text" && typeof part.text === "string"
        ? { ...part, text: this.mask(part.text) }
        : part,
    ) as BaseMessage["content"];
  }

  /**
   * The messages as the model may see them: every phone number swapped for its label. A message without one is
   * passed on as the same object (an answer the model wrote keeps everything Gemini needs to read it back).
   */
  maskMessages(messages: BaseMessage[]): BaseMessage[] {
    return messages.map((m) => {
      const content = this.maskContent(m.content);
      if (AIMessage.isInstance(m)) {
        const calls = m.tool_calls?.map((c) => ({ ...c, args: this.maskArgs(c.args) }));
        const same = JSON.stringify(content) === JSON.stringify(m.content) && JSON.stringify(calls) === JSON.stringify(m.tool_calls);
        if (same) return m;
        return new AIMessage({
          content,
          tool_calls: calls,
          invalid_tool_calls: m.invalid_tool_calls,
          additional_kwargs: m.additional_kwargs,
          response_metadata: m.response_metadata,
          usage_metadata: m.usage_metadata,
          id: m.id,
          name: m.name,
        });
      }
      if (JSON.stringify(content) === JSON.stringify(m.content)) return m;
      if (ToolMessage.isInstance(m)) {
        return new ToolMessage({ content, artifact: m.artifact, tool_call_id: m.tool_call_id, name: m.name, status: m.status });
      }
      if (HumanMessage.isInstance(m)) return new HumanMessage({ content, id: m.id });
      if (SystemMessage.isInstance(m)) return new SystemMessage({ content, id: m.id });
      return m;
    });
  }

  /** Reads the messages for their numbers (labels them in order), as maskMessages would, without changing them */
  learn(messages: BaseMessage[]): this {
    this.maskMessages(messages);
    return this;
  }

  /** The labels from these messages: what the graph's model step gave the model for them */
  static from(messages: BaseMessage[]): PhoneBook {
    return new PhoneBook().learn(messages);
  }
}

/**
 * Unmasks words that arrive a few letters at a time: a label can be cut in half ("…call [pho" + "ne 1] now"), so
 * an unfinished "[" at the end is held back until the rest arrives. `flush` gives back what's held at the end.
 */
export class StreamUnmasker {
  private held = "";
  private book: PhoneBook;
  // Written out (not `constructor(private book…)`): Node runs our scripts' TypeScript by stripping types only
  constructor(book: PhoneBook) {
    this.book = book;
  }

  push(piece: string): string {
    const text = this.held + piece;
    const open = text.lastIndexOf("[");
    // An unfinished label: "[" with no "]" after it, short enough to still become "[phone 12]"
    if (open >= 0 && !text.includes("]", open) && text.length - open < 16 && /^\[\s*(p(h(o(n(e[\s_]*\d*)?)?)?)?)?$/i.test(text.slice(open))) {
      this.held = text.slice(open);
      return this.book.unmask(text.slice(0, open));
    }
    this.held = "";
    return this.book.unmask(text);
  }

  flush(): string {
    const rest = this.book.unmask(this.held);
    this.held = "";
    return rest;
  }
}
