import { AIMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { cardFor } from "./cards";
import { PhoneBook, StreamUnmasker } from "./phones";
import { stepFor } from "./steps";
import type { StreamEvent, ToolStep } from "./types";

/**
 * What the chat is told while the graph runs (StreamEvent in lib/assistant/types.ts). The graph streams two
 * kinds of thing at once, each as [kind, payload]:
 * - "messages": every piece any model writes, as [piece, details]. details.langgraph_node says which step wrote
 *   it; only the "model" step's words are the answer.
 * - "updates": what a step added to the state, when the step ends. After the "model" step: the tool calls it
 *   asked for, which start running now. After the "tools" step: one ToolMessage per finished call, carrying the
 *   call's id (tool_call_id), which is how we know which chip to tick.
 */
export async function* events(
  stream: AsyncIterable<[string, unknown]>,
  /** Told about each tool the model calls, with the inputs it chose (the route saves them with the answer, 5.2) */
  onToolCall?: (call: { name: string; args: Record<string, unknown> }) => void,
  /**
   * The phone labels the model was given (lib/assistant/phones.ts), learnt from the messages the graph started
   * with. The model writes "[phone 1]"; the admin sees, and the chat saves, the real number. It learns the steps'
   * messages as they come, in the same order the graph's state gets them, so its labels match the model's.
   */
  book: PhoneBook = new PhoneBook(),
): AsyncGenerator<StreamEvent> {
  // tool call id → the call (for its card) and its chip, until it's done
  const running = new Map<string, { name: string; args: Record<string, unknown>; step: ToolStep }>();
  const words = new StreamUnmasker(book);
  for await (const [kind, payload] of stream) {
    if (kind === "messages") {
      const [piece, details] = payload as [BaseMessage, Record<string, unknown>];
      if (details.langgraph_node === "model" && piece.text) {
        const text = words.push(piece.text);
        if (text) yield { type: "text", text };
      }
      continue;
    }
    if (kind !== "updates") continue;
    const update = payload as Record<string, { messages?: BaseMessage[] } | undefined>;
    const said = words.flush(); // a step ended: nothing more is coming for a held-back "[…"
    if (said) yield { type: "text", text: said };
    for (const message of update.model?.messages ?? []) {
      book.learn([message]);
      for (const call of AIMessage.isInstance(message) ? (message.tool_calls ?? []) : []) {
        const id = call.id ?? call.name;
        const args = book.unmaskArgs(call.args);
        const step = stepFor(call.name, args);
        running.set(id, { name: call.name, args, step });
        onToolCall?.({ name: call.name, args });
        yield { type: "step", state: "running", id, step };
      }
    }
    book.learn(update.tools?.messages ?? []);
    for (const message of update.tools?.messages ?? []) {
      if (!ToolMessage.isInstance(message)) continue;
      const call = running.get(message.tool_call_id);
      if (!call) continue;
      running.delete(message.tool_call_id);
      yield { type: "step", state: "done", id: message.tool_call_id, step: call.step };
      // The tool's own result (artifact), made into a card for the screen. The model only ever saw the content.
      const card = cardFor(call.name, call.args, message.artifact);
      if (card) yield { type: "card", card };
    }
  }
  const rest = words.flush();
  if (rest) yield { type: "text", text: rest };
}

/** One event as a line of JSON (NDJSON: the chat splits the stream at each "\n") */
export const line = (event: StreamEvent) => `${JSON.stringify(event)}\n`;

/** The response headers for an answer. no-store: every answer is new; nothing in between may keep a copy. */
export const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" };
