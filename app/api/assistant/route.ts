import { AIMessage, type AIMessageChunk, type BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { can, currentUser } from "@/lib/auth";
import { mainModel } from "@/lib/assistant/model";
import { systemPrompt } from "@/lib/assistant/prompt";

/** Earlier messages sent with each question: 20 = the last 10 questions and their answers */
const MAX_HISTORY = 20;
/** Longest earlier message we pass on (characters); longer ones are cut, so old chats can't use up the token limit */
const MAX_CHARS = 4000;

type Turn = { role: "user" | "assistant"; text: string };

/**
 * The chat so far, as the browser sent it, turned into messages for the model. The model remembers nothing
 * between calls, so this is how it knows what "and tomorrow?" follows. Never trust the browser: anything
 * that isn't a question or an answer with text is skipped, and only complete pairs are kept (a question
 * whose answer never came is dropped), so the model always sees question, answer, question, answer…
 */
function readHistory(value: unknown): BaseMessage[] {
  if (!Array.isArray(value)) return [];
  const turns = value.filter(
    (t): t is Turn => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string" && t.text.trim() !== "",
  );
  const messages: BaseMessage[] = [];
  for (let i = 0; i + 1 < turns.length; i++) {
    if (turns[i].role === "user" && turns[i + 1].role === "assistant") {
      messages.push(new HumanMessage(turns[i].text.slice(0, MAX_CHARS)), new AIMessage(turns[i + 1].text.slice(0, MAX_CHARS)));
      i++; // the answer is used too
    }
  }
  return messages.slice(-MAX_HISTORY);
}

/**
 * Annapurna Assist's API: the browser sends a question, the server asks Gemini and passes the reply on
 * piece by piece while Gemini is still writing it. The model is called only here, on the server, so the
 * API key never reaches the browser.
 *
 *   POST /api/assistant   { "message": "And tomorrow?", "history": [{ "role": "user", "text": "…" }, { "role": "assistant", "text": "…" }] }
 *   → 200, plain text arriving in pieces: "Today " "there are " "3 bookings…"
 *   → or an error status with { "error": "…" }
 */
export async function POST(request: Request) {
  // 1. Who is asking? Same check as the dashboard pages, but an API answers with a status code instead of a redirect.
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in to the dashboard." }, { status: 401 });
  if (!can(user, "useAssistant")) return Response.json({ error: "Your role can view the assistant, not ask it." }, { status: 403 });

  // 2. What are they asking? Never trust the browser: check the body is what we expect.
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Type a question first." }, { status: 400 });
  const history = readHistory(body?.history);

  // 3. Ask the model: our rules first, then the chat so far, then the new question. `signal` fires if the browser goes away
  //    (Stop, tab closed), so Gemini stops writing and we don't use up tokens nobody will read.
  let pieces: AsyncIterator<AIMessageChunk>;
  let first: IteratorResult<AIMessageChunk>;
  try {
    const stream = await mainModel().stream(
      [new SystemMessage(systemPrompt({ firstName: user.name.split(" ")[0] })), ...history, new HumanMessage(message)],
      { signal: request.signal },
    );
    pieces = stream[Symbol.asyncIterator]();
    // Wait for the first piece before answering: most failures (bad key, over the free limit) show up here,
    // while we can still send a proper error status. Once the 200 has gone out, the status can't change.
    first = await pieces.next();
  } catch (err) {
    // The real reason goes to the server log; the browser gets a plain message (nicer errors come in 1.12)
    console.error("Annapurna Assist: the model call failed", err);
    return Response.json({ error: "The assistant couldn't answer right now. Please try again." }, { status: 502 });
  }

  // 4. Pass the pieces on as they arrive. The browser reads bytes, so each piece of text is encoded to UTF-8
  //    (Telugu and Hindi letters take several bytes each).
  const encoder = new TextEncoder();

  const reply = new ReadableStream<Uint8Array>({
    // Runs once, straight away: the piece we already have
    start(controller) {
      if (first.done) return controller.close();
      if (first.value.text) controller.enqueue(encoder.encode(first.value.text));
    },
    // Runs each time the browser is ready for more: wait for Gemini's next piece and pass it on.
    // Some pieces carry no text (only token counts), so keep reading until one does, or the stream could stall.
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await pieces.next();
          if (done) return controller.close();
          if (value.text) return controller.enqueue(encoder.encode(value.text));
        }
      } catch (err) {
        // Gemini failed halfway: end the stream with an error, so the browser knows the reply is cut short
        console.error("Annapurna Assist: the reply stopped halfway", err);
        controller.error(err);
      }
    },
    // The browser went away: tell Gemini to stop too
    cancel() {
      pieces.return?.();
    },
  });

  return new Response(reply, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store", // every answer is new; nothing in between may keep a copy
    },
  });
}
