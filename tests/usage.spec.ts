import "./unitDb"; // first: the no-browser tests' throwaway database and the fake models
import { HumanMessage } from "@langchain/core/messages";
import { expect, test } from "@playwright/test";
import { query } from "@/lib/db";
import { graph } from "@/lib/assistant/graph";
import { isOnTopic } from "@/lib/assistant/guard";
import { logRequest, UsageRecorder } from "@/lib/assistant/requestLog";
import { writeTitle } from "@/lib/assistant/titles";

/** Step 8: the usage log. The fake models report pretend token counts, like Gemini's usage_metadata. */

test("one recorder hears every model call a question makes, each with its purpose and tokens, and the row is saved", async () => {
  const recorder = new UsageRecorder();
  // The three kinds of call a question can make, each given the same recorder
  expect(await isOnTopic("Which bookings are upcoming?", undefined, new AbortController().signal, [recorder])).toBe(true);
  expect(await writeTitle("Which bookings are upcoming?", [recorder])).toContain("About:");
  await graph.invoke(
    { messages: [new HumanMessage('[tool:get_today] What is the date?')] },
    { configurable: { userId: 1 }, callbacks: [recorder] },
  );
  // The graph's model ran twice (ask for the tool, then answer), each call deep inside the graph still heard
  expect(recorder.calls.map((c) => c.purpose)).toEqual(["guard", "title", "answer", "answer"]);
  for (const c of recorder.calls) {
    expect(c.model).toBe("fake");
    expect(c.input).toBeGreaterThan(0);
    expect(c.output).toBeGreaterThan(0);
  }
  // The second answer call sent more: the question again, plus the tool call and its result
  expect(recorder.calls[3].input).toBeGreaterThan(recorder.calls[2].input);

  const [owner] = await query<{ id: number }>(
    `INSERT INTO users (mobile, name, role, password_hash, created_by) VALUES ('9000000081', 'Usage Tester', 'admin', 'x', 'tests')
     ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name RETURNING id::int`,
  );
  const chatId = crypto.randomUUID();
  await query("INSERT INTO assistant_chats (id, user_id) VALUES ($1, $2)", [chatId, owner.id]);
  await logRequest({ userId: owner.id, chatId, outcome: "answered", model: "fake", calls: recorder.calls, tools: ["get_today"], firstTextMs: 120, totalMs: 900 });
  const [row] = await query<{ outcome: string; input_tokens: number; output_tokens: number; tools: string[]; calls: unknown[]; total_ms: number }>(
    "SELECT outcome, input_tokens, output_tokens, tools, calls, total_ms FROM assistant_requests WHERE chat_id = $1",
    [chatId],
  );
  expect(row).toMatchObject({ outcome: "answered", tools: ["get_today"], total_ms: 900 });
  expect(row.input_tokens).toBe(recorder.calls.reduce((n, c) => n + c.input, 0));
  expect(row.calls).toHaveLength(4);

  // Deleting the chat keeps the row (the tokens were used), without the chat
  await query("DELETE FROM assistant_chats WHERE id = $1", [chatId]);
  const [kept] = await query<{ n: number }>("SELECT count(*)::int AS n FROM assistant_requests WHERE user_id = $1 AND chat_id IS NULL", [owner.id]);
  expect(kept.n).toBeGreaterThanOrEqual(1);
});
