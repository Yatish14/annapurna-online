import "./unitDb"; // first: the no-browser tests' throwaway database and the fake models
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { expect, test } from "@playwright/test";
import { buildGraph } from "@/lib/assistant/graph";

/**
 * 5.9: LangGraph's own memory, a checkpointer, on our real graph, to compare it with our saved chats
 * (docs/assistant-checkpointer.md). MemorySaver keeps the checkpoints in memory; the Postgres checkpointer
 * (@langchain/langgraph-checkpoint-postgres) has the same interface and keeps them in tables of its own.
 *
 * (The tool is in the second question, not the first: the fake model finds "the question" by where this turn's
 * tool results start, which assumes earlier turns carry no tool results. Our saved history never does; a
 * checkpointer's always does, which is one of the differences.)
 */

test("a checkpointer remembers a thread by itself, keeps every message and step, and keeps threads apart", async () => {
  const checkpointer = new MemorySaver();
  const graph = buildGraph(undefined, checkpointer);
  // thread_id: which conversation. Ours would be the chat id.
  const thread = { configurable: { thread_id: "chat-1", userId: 1 } };

  await graph.invoke({ messages: [new HumanMessage("What's the date?")] }, thread);
  // Only the new question goes in, no history: the checkpointer adds the rest by itself
  const second = await graph.invoke({ messages: [new HumanMessage("[tool:get_today] And by the tool?")] }, thread);
  const answer = second.messages.at(-1)!.text;
  expect(answer).toContain("Earlier questions in this chat: 1.");
  expect(answer).toContain("Tools used: get_today: found");

  // What it keeps: every message, including the model's tool call and the tool's whole result (our saved chats keep
  // only what the chat showed: the words, chips and cards)
  expect(second.messages.map((m) => m.getType())).toEqual(["human", "ai", "human", "ai", "tool", "ai"]);
  expect(String(second.messages[4].content)).toContain('"status":"found"');
  // …and what the checkpointer itself saved has the tool's artifact too (for our tools: the rows behind a card)
  const saved = await checkpointer.getTuple(thread);
  const savedMessages = (saved?.checkpoint.channel_values as { messages: { getType(): string; artifact?: unknown }[] }).messages;
  expect(savedMessages.find((m) => m.getType() === "tool")?.artifact).toMatchObject({ status: "found" });

  // And a checkpoint after every step of the graph, not one row per message: the state at each point, for
  // replaying or resuming from any step
  let checkpoints = 0;
  for await (const _ of checkpointer.list(thread)) checkpoints++;
  expect(checkpoints).toBeGreaterThanOrEqual(6);

  // Another thread knows nothing of this one
  const other = await graph.invoke({ messages: [new HumanMessage("Hello")] }, { configurable: { thread_id: "chat-2" } });
  expect(other.messages.at(-1)!.text).toContain("Earlier questions in this chat: 0.");
});
