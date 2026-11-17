import type { NewMessage } from "./chatStore";
import type { StreamEvent } from "./types";

/**
 * How an answer ends, for the API route (app/api/assistant/route.ts): an error in words an admin can act on, and
 * the saved answer (5.2). Here rather than in the route because a route file may only export its handlers, and
 * the tests call these directly (tests/chats.spec.ts).
 */

/**
 * Turns a failed model call into a status code and a message an admin can act on. The full details
 * stay in the server log. (@langchain/google's errors carry Google's `statusCode` and a `name`.)
 */
export function explain(err: unknown): { status: number; error: string } {
  const e = (err ?? {}) as { name?: string; statusCode?: number; data?: unknown };
  const details = JSON.stringify(e.data ?? "");
  if (e.statusCode === 429) {
    // Over the free limit. Google says which one: per minute (wait a bit) or per day (wait for the reset)
    return details.includes("PerDay")
      ? { status: 429, error: "Today's free questions are used up. They come back at about 1:30 pm (India time)." }
      : { status: 429, error: "Too many questions in the last minute. Wait a minute, then try again." };
  }
  if (e.name === "GraphRecursionError") {
    // The hard step limit: the model kept going round the tool loop
    return { status: 500, error: "That took too many steps, so I stopped. Try asking for one thing at a time." };
  }
  if (e.name === "PromptBlockedError") {
    return { status: 400, error: "Google's safety filter blocked this question. Try asking it another way." };
  }
  if (e.statusCode === 401 || e.statusCode === 403 || details.includes("API_KEY")) {
    return { status: 500, error: "Google rejected the assistant's API key. Check GOOGLE_API_KEY in .env.local." };
  }
  if (e.statusCode && e.statusCode >= 500) {
    return { status: 503, error: "Google's AI service is busy or down right now. Try again in a minute." };
  }
  return { status: 502, error: "The assistant couldn't answer right now. Please try again." };
}

/** What the chat shows when the stream broke after some words (the same words as the chat, components/assistant) */
const CUT_OFF = "The reply was cut off halfway. Please try again.";
const EMPTY = "Gemini sent back an empty answer. Try asking another way.";

/**
 * Passes the events on unchanged, and saves the answer when it ends, however it ends (5.2): finished, Stop
 * pressed (`stopped`), or failed (`error`, in the words the chat shows). What's saved is what the chat showed:
 * the words, the chips that were ticked and the cards, plus the tools the model called.
 */
export async function* savedAs(source: AsyncGenerator<StreamEvent>, answer: NewMessage, save: (m: NewMessage) => Promise<unknown>, signal: AbortSignal) {
  let error: string | undefined;
  try {
    for await (const event of source) {
      if (event.type === "text") answer.text += event.text;
      else if (event.type === "step" && event.state === "done") answer.steps!.push(event.step);
      else if (event.type === "card") answer.cards!.push(event.card);
      yield event;
    }
  } catch (err) {
    // Before the first piece: the route's explanation (over the limit…); after some words: cut off halfway
    if (!signal.aborted) error = answer.text ? CUT_OFF : explain(err).error;
    throw err;
  } finally {
    answer.text = answer.text.trim();
    const stopped = signal.aborted;
    if (!stopped && !error && !answer.text) error = EMPTY;
    await save({ ...answer, stopped, error }).catch((err) => console.error("Annapurna Assist: couldn't save the answer", err));
  }
}
