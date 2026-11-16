import { AIMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { cardFor } from "./cards";
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
export async function* events(stream: AsyncIterable<[string, unknown]>): AsyncGenerator<StreamEvent> {
  // tool call id → the call (for its card) and its chip, until it's done
  const running = new Map<string, { name: string; args: Record<string, unknown>; step: ToolStep }>();
  for await (const [kind, payload] of stream) {
    if (kind === "messages") {
      const [piece, details] = payload as [BaseMessage, Record<string, unknown>];
      if (details.langgraph_node === "model" && piece.text) yield { type: "text", text: piece.text };
      continue;
    }
    if (kind !== "updates") continue;
    const update = payload as Record<string, { messages?: BaseMessage[] } | undefined>;
    for (const message of update.model?.messages ?? []) {
      for (const call of AIMessage.isInstance(message) ? (message.tool_calls ?? []) : []) {
        const id = call.id ?? call.name;
        const step = stepFor(call.name, call.args);
        running.set(id, { name: call.name, args: call.args, step });
        yield { type: "step", state: "running", id, step };
      }
    }
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
}

/** One event as a line of JSON (NDJSON: the chat splits the stream at each "\n") */
export const line = (event: StreamEvent) => `${JSON.stringify(event)}\n`;

/** The response headers for an answer. no-store: every answer is new; nothing in between may keep a copy. */
export const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" };
