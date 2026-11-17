import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { can, currentUser } from "@/lib/auth";
import { addMessage, ensureChat, isChatId, type NewMessage, setTitle } from "@/lib/assistant/chatStore";
import { explain, savedAs } from "@/lib/assistant/replies";
import { graph, RECURSION_LIMIT } from "@/lib/assistant/graph";
import { isOnTopic, refusal } from "@/lib/assistant/guard";
import { historyFor } from "@/lib/assistant/history";
import { DAILY_LIMIT, MAX_LENGTH } from "@/lib/assistant/limits";
import { USE_FAKE } from "@/lib/assistant/model";
import { systemPrompt } from "@/lib/assistant/prompt";
import { titleFrom } from "@/lib/assistant/suggestions";
import { events, line, NDJSON } from "@/lib/assistant/stream";
import type { StreamEvent } from "@/lib/assistant/types";
import { countQuestion } from "@/lib/assistant/usage";

/**
 * Annapurna Assist's API: the browser sends a question, the server asks Gemini and passes the reply on
 * piece by piece while Gemini is still writing it. The model is called only here, on the server, so the
 * API key never reaches the browser.
 *
 *   POST /api/assistant   { "message": "And tomorrow?", "chatId": "<uuid>", "voice": false }
 *   → 200, one JSON event per line, arriving as the answer is made:
 *       {"type":"step","state":"running","id":"…","step":{"label":"Checked bookings","icon":"bookings"}}
 *       {"type":"step","state":"done",…}
 *       {"type":"text","text":"Today "}  {"type":"text","text":"there are 3 bookings…"}
 *   → or an error status with { "error": "…" }
 *
 * The chat is saved as it goes (Step 5): the question once it's counted, the answer when it ends. The chat so far
 * comes from the saved chat, not from the browser.
 */
export async function POST(request: Request) {
  // 1. Who is asking? Same check as the dashboard pages, but an API answers with a status code instead of a redirect.
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in to the dashboard." }, { status: 401 });
  if (!can(user, "useAssistant")) return Response.json({ error: "Your role can view the assistant, not ask it." }, { status: 403 });

  // 2. What are they asking, in which chat? Never trust the browser: check the body is what we expect.
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Type a question first." }, { status: 400 });
  // The chat box stops at this length too, but a request can be sent without the chat box
  if (message.length > MAX_LENGTH) {
    return Response.json({ error: `Questions can be up to ${MAX_LENGTH} characters. Try a shorter one.` }, { status: 413 });
  }
  const chatId: unknown = body?.chatId;
  const voice = body?.voice === true;
  // A new id becomes a new chat for this admin; another admin's chat is as if it didn't exist
  const chat = isChatId(chatId) ? await ensureChat(chatId, user.id) : null;
  if (!chat) return Response.json({ error: "This chat wasn't found. Start a new chat." }, { status: 404 });
  // The chat so far, from the database (lib/assistant/history.ts), read before this question is added to it
  const history = await historyFor(chat.id, user.id);
  if (!process.env.GOOGLE_API_KEY && !USE_FAKE) {
    return Response.json({ error: "The assistant isn't set up yet: GOOGLE_API_KEY is missing from .env.local." }, { status: 500 });
  }

  // Today's limit for this admin. Counted before the off-topic check, because the check uses a request too.
  if ((await countQuestion(user.id)) === null) {
    return Response.json(
      { error: `You've asked ${DAILY_LIMIT} questions today, the daily limit. You can ask again after midnight.` },
      { status: 429 },
    );
  }
  // Counted, so it's part of the chat now, whatever happens next
  const save = (m: NewMessage) => addMessage(chat.id, user.id, m);
  await save({ role: "user", text: message, voice });
  // A new chat's first title, for the chat list: its first question, cut short (the same as the chat shows)
  if (!chat.titled && chat.title === "New chat") await setTitle(chat.id, user.id, titleFrom(message), false);

  // 3. Is it about the business? A quick check first (lib/assistant/guard.ts); the main model never sees off-topic
  //    questions. The previous question goes along, so a follow-up like "and for 3?" makes sense.
  //    The "no" is sent like a normal reply, so the chat shows it as the assistant's answer.
  const earlier = history.findLast((m) => m instanceof HumanMessage)?.text;
  if (!(await isOnTopic(message, earlier, request.signal))) {
    const text = refusal(message);
    await save({ role: "assistant", text });
    return new Response(line({ type: "text", text }), { headers: NDJSON });
  }

  // 4. Run the graph (lib/assistant/graph.ts) with our rules first, then the chat so far, then the new question.
  //    `signal` fires if the browser goes away (Stop, tab closed), so the graph and Gemini stop and we don't use
  //    up tokens nobody will read.
  const answer: NewMessage = { role: "assistant", text: "", steps: [], cards: [], toolCalls: [] };
  let pieces: AsyncIterator<StreamEvent>;
  let first: IteratorResult<StreamEvent>;
  try {
    const messages = [new SystemMessage(systemPrompt({ firstName: user.name.split(" ")[0] })), ...history, new HumanMessage(message)];
    // Two stream modes at once: the answer's words ("messages") and each step's results ("updates", for the chips)
    // recursionLimit: the hard stop for the whole run (lib/assistant/graph.ts explains both limits)
    const stream = await graph.stream(
      { messages },
      {
        streamMode: ["messages", "updates"],
        signal: request.signal,
        recursionLimit: RECURSION_LIMIT,
        // Who is asking, from the session: tools that keep something for the admin (draft_booking) read it here
        configurable: { userId: user.id },
      },
    );
    pieces = savedAs(events(stream as AsyncIterable<[string, unknown]>, (call) => answer.toolCalls!.push(call)), answer, save, request.signal);
    // Wait for the first piece before answering: most failures (bad key, over the free limit) show up here,
    // while we can still send a proper error status. Once the 200 has gone out, the status can't change.
    first = await pieces.next();
  } catch (err) {
    // Stop pressed before the first word: not a failure, and nobody is waiting for an answer
    if (request.signal.aborted) return new Response(null, { status: 499 });
    // The real reason goes to the server log; the browser gets a message an admin understands
    // (savedAs has already saved the answer with this message)
    console.error("Annapurna Assist: the model call failed", err);
    const { status, error } = explain(err);
    return Response.json({ error }, { status });
  }

  // 5. Pass the events on as they arrive, one JSON line each. The browser reads bytes, so each line is encoded to
  //    UTF-8 (Telugu and Hindi letters take several bytes each).
  const encoder = new TextEncoder();

  const reply = new ReadableStream<Uint8Array>({
    // Runs once, straight away: the event we already have (a chip, or the first words)
    start(controller) {
      if (first.done) return controller.close();
      controller.enqueue(encoder.encode(line(first.value)));
    },
    // Runs each time the browser is ready for more: wait for the next event and pass it on
    async pull(controller) {
      try {
        const { done, value } = await pieces.next();
        if (done) return controller.close();
        controller.enqueue(encoder.encode(line(value)));
      } catch (err) {
        // Gemini failed halfway: end the stream with an error, so the browser knows the reply is cut short
        if (!request.signal.aborted) console.error("Annapurna Assist: the reply stopped halfway", err);
        controller.error(err);
      }
    },
    // The browser went away: tell Gemini to stop too
    cancel() {
      pieces.return?.(undefined);
    },
  });

  // no-store: every answer is new; nothing in between may keep a copy
  return new Response(reply, { headers: NDJSON });
}
