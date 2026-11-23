import "./unitDb"; // first: the no-browser tests' throwaway database and the fake models
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import { type BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { expect, test } from "@playwright/test";
import { graph } from "@/lib/assistant/graph";
import { findPhones, PhoneBook, StreamUnmasker } from "@/lib/assistant/phones";
import { events } from "@/lib/assistant/stream";
import type { StreamEvent } from "@/lib/assistant/types";
import { query } from "@/lib/db";

/**
 * Phone masking (lib/assistant/phones.ts): a phone number typed in the chat reaches the model only as "[phone 1]";
 * the tools, the cards, the saved chat and the admin get the real number. No browser, no AI: the fake model.
 */

test("finds Indian phone numbers however they're written", () => {
  const cases: [string, string[]][] = [
    ["9999999999", ["9999999999"]],
    ["919999999999", ["9999999999"]],
    ["99999 99999", ["9999999999"]],
    ["+91 98480 22338", ["9848022338"]],
    ["+91 98480-22338", ["9848022338"]],
    ["(+91) 98480.22338", ["9848022338"]],
    ["0 98480 22338", ["9848022338"]],
    ["09848022338", ["9848022338"]],
    ["9 8 4 8 0 2 2 3 3 8", ["9848022338"]],
    ["call 040-2345 6789 or 98480 22338", ["04023456789", "9848022338"]],
    ["98480 22338 98480 22339", ["9848022338", "9848022339"]],
    ["9848022338, 7013011223", ["9848022338", "7013011223"]],
    ["on 19 9848022338 please", ["9848022338"]],
    ["VB-0012 9848022338", ["9848022338"]],
    ["౯౮౪౮౦ ౨౨౩౩౮", ["9848022338"]], // Telugu digits
    ["९८४८० २२३३८", ["9848022338"]], // Devanagari digits
  ];
  for (const [text, want] of cases) expect(findPhones(text), text).toEqual(want);
});

test("leaves dates, amounts and booking numbers alone", () => {
  for (const text of [
    "2026-11-19",
    "19.11.2026",
    "₹15000",
    "15000 20000", // two amounts: 10 digits, but not a mobile (starts with 1)
    "₹1,20,000",
    "VB-0012",
    "P-1003",
    "5999999999", // starts with 5: not an Indian mobile
    "99999 9999", // 9 digits
    "12345678901234",
  ]) {
    expect(findPhones(text), text).toEqual([]);
  }
});

test("masks with labels in order, the same number always the same label, and unmasks back", () => {
  const book = new PhoneBook();
  const masked = book.mask("Ravi 98480 22338, his brother +91 70130 11223, Ravi again 9848022338");
  expect(masked).toBe("Ravi [phone 1], his brother [phone 2], Ravi again [phone 1]");
  expect(book.unmask("Is [phone 2] right? And [phone 1]?")).toBe("Is 7013011223 right? And 9848022338?");
  // An unknown label stays: there's nothing to put back
  expect(book.unmask("[phone 7]")).toBe("[phone 7]");
  // Tool inputs: loosely, as models sometimes drop the brackets
  expect(book.unmaskArgs({ customer_phone: "phone 1", nested: ["[Phone_2]"], days: 2 })).toEqual({
    customer_phone: "9848022338",
    nested: ["7013011223"],
    days: 2,
  });
  // The same messages give the same labels, wherever they're worked out
  const messages = [new SystemMessage("rules"), new HumanMessage("book 70130 11223"), new HumanMessage("and 98480 22338")];
  const sent = new PhoneBook().maskMessages(messages);
  expect(sent.map((m) => m.text)).toEqual(["rules", "book [phone 1]", "and [phone 2]"]);
  expect(sent[0]).toBe(messages[0]); // unchanged messages are passed on as they are
  expect(PhoneBook.from(messages).unmask("[phone 2]")).toBe("9848022338");
});

test("a label cut in half while streaming is held back until it's whole", () => {
  const book = new PhoneBook();
  book.mask("98480 22338");
  const words = new StreamUnmasker(book);
  const out = ["Calling [", "pho", "ne 1", "] now, [", "not a label]", " and [ph"].map((p) => words.push(p)).join("") + words.flush();
  expect(out).toBe("Calling 9848022338 now, [not a label] and [ph");
});

/** Every request the model gets, as sent */
class Seen extends BaseCallbackHandler {
  name = "phones-test";
  sent: BaseMessage[] = [];
  async handleChatModelStart(_llm: Serialized, messages: BaseMessage[][]) {
    this.sent.push(...messages.flat());
  }
}

test("through the graph: the model sees only the label, the tool finds the real number, the admin sees it", async () => {
  const PHONE = "9000000081";
  const [car] = await query<{ id: number }>("INSERT INTO vehicles (name, created_by) VALUES ('Phone Test Car', 'tests') RETURNING id::int");
  const [driver] = await query<{ id: number }>("INSERT INTO drivers (name, phone, created_by) VALUES ('Phone Test Driver', '9000000082', 'tests') RETURNING id::int");
  await query(
    `INSERT INTO trips (vehicle_id, driver_id, customer_name, customer_phone, start_date, end_date, pickup_state, pickup_city,
                        drop_state, drop_city, created_by)
     VALUES ($1, $2, 'Phone Masking Customer', $3, (now() AT TIME ZONE 'Asia/Kolkata')::date + 310, (now() AT TIME ZONE 'Asia/Kolkata')::date + 310,
             'Andhra Pradesh', 'Vijayawada', 'Andhra Pradesh', 'Guntur', 'tests')`,
    [car.id, driver.id, PHONE],
  );
  // The fake model asks for the tools in [tool:…] tags, so the number is in its question: it reads "[phone 1]"
  const messages = [new HumanMessage(`[tool:search_bookings {"query":"+91 90000 00081"}] whose number is +91 90000 00081?`)];
  const seen = new Seen();
  const stream = await graph.stream({ messages }, { streamMode: ["messages", "updates"], configurable: { userId: 1 }, callbacks: [seen] });
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const got: StreamEvent[] = [];
  for await (const e of events(stream as AsyncIterable<[string, unknown]>, (c) => calls.push(c), PhoneBook.from(messages))) got.push(e);

  // 1. Nothing the model got had the number, or any phone number
  expect(seen.sent.length).toBeGreaterThan(0);
  for (const m of seen.sent) {
    expect(findPhones(m.text), m.text).toEqual([]);
    expect(JSON.stringify((m as { tool_calls?: unknown }).tool_calls ?? []), "its tool calls").not.toContain(PHONE);
  }
  expect(seen.sent.some((m) => m.text.includes("[phone 1]"))).toBe(true);
  // 2. The tool ran with the real number, and found the booking (its card has it)
  const cards = got.filter((e) => e.type === "card");
  expect(JSON.stringify(cards)).toContain("Phone Masking Customer");
  // 3. The admin's chips and the saved tool calls have the real number, and so do the answer's words
  expect(calls[0].args.query).toBe(PHONE); // "+91 90000 00081" was one label: it comes back as the forms keep it
  const text = got.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
  expect(text).toContain("9000000081");
  expect(text).not.toContain("[phone");
});

test("the tool's result is masked too, when it has a phone number (normal mode)", async () => {
  const messages = [new HumanMessage('[tool:search_bookings {"query":"Phone Masking Customer"}] find them')];
  const seen = new Seen();
  await graph.invoke({ messages }, { configurable: { userId: 1 }, callbacks: [seen] });
  const results = seen.sent.filter((m) => ToolMessage.isInstance(m));
  expect(results.length).toBeGreaterThan(0);
  for (const m of seen.sent) expect(findPhones(m.text), m.text).toEqual([]);
});
