import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { can, currentUser } from "@/lib/auth";
import { mainModel } from "@/lib/assistant/model";
import { systemPrompt } from "@/lib/assistant/prompt";

/**
 * Annapurna Assist's API: the browser sends a question, the server asks Gemini and sends back the reply.
 * The model is called only here, on the server, so the API key never reaches the browser.
 *
 *   POST /api/assistant   { "message": "How many bookings today?" }   →   { "reply": "…" }
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

  // 3. Ask the model: our rules first, then the question. Waits for the whole answer (streaming comes in 1.8).
  try {
    const answer = await mainModel().invoke([
      new SystemMessage(systemPrompt({ firstName: user.name.split(" ")[0] })),
      new HumanMessage(message),
    ]);
    return Response.json({ reply: answer.text });
  } catch (err) {
    // The real reason goes to the server log; the browser gets a plain message (nicer errors come in 1.12)
    console.error("Annapurna Assist: the model call failed", err);
    return Response.json({ error: "The assistant couldn't answer right now. Please try again." }, { status: 502 });
  }
}
