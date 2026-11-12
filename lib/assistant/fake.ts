import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { BaseChatModel, type BindToolsInput } from "@langchain/core/language_models/chat_models";
import { AIMessage, AIMessageChunk, type BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";

/**
 * Pretend models for tests and for trying the UI (ASSISTANT_FAKE=1 in .env.local). They never call Google:
 * free, instant, no API key needed, and the same question always gets the same answer, so a test can check
 * the exact words. Any LangChain chat model is a class with these two methods: one for the whole answer
 * (invoke) and one for the answer in pieces (stream). The rest (messages, signals, callbacks) LangChain adds.
 *
 * Words in a question that make the fake do something, to test the app without waiting for a real model to:
 *   [tool:list_bookings {"status":"upcoming"}]   asks for that tool with those inputs (several tags = several
 *                 tools at once), then answers by saying which tools ran and what they found
 *   [loop]        asks for get_today every turn, and on the last turn (out of rounds) still asks with no
 *                 words, so the graph's own "I looked things up several times…" answer is tested
 *   [off-topic]   the off-topic check says BLOCK
 *   [fail:429]    fails before the first word with that status (429 rate limit, 500 Google down, 401 bad key…)
 *   [cut]         fails after a few words, like a reply cut off halfway
 *   [slow]        writes slowly (about 4 s), so there's time to press Stop
 */

type Call = { name: string; args: Record<string, unknown> };
/** One turn of the fake: words, tool calls, or (to test a model misbehaving) both empty words and calls */
type Turn = { text: string; calls?: Call[] };

/** What the fake can see: the admin's question, what came before it, and this turn's tool results so far */
type Seen = { question: string; earlier: number; results: ToolMessage[]; outOfRounds: boolean };
type Script = (seen: Seen) => Turn;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let callNo = 0;

/** The [tool:…] tags in a question, as tool calls. Inputs are JSON; a tag without them sends {}. */
function taggedCalls(question: string): Call[] {
  return [...question.matchAll(/\[tool:(\w+)(?:\s+(\{[^\]]*\}))?\]/g)].map(([, name, json]) => ({
    name,
    args: json ? (JSON.parse(json) as Record<string, unknown>) : {},
  }));
}

class FakeModel extends BaseChatModel {
  private script: Script;

  constructor(script: Script) {
    super({});
    this.script = script;
  }

  _llmType() {
    return "annapurna-fake";
  }

  /** The graph offers the model its tools. The fake asks for tools by name from the question, so it ignores the list. */
  bindTools(_tools: BindToolsInput[]) {
    return this;
  }

  /**
   * What the fake sees. The admin's question is the last HumanMessage before this turn's first tool result.
   * A HumanMessage after a tool result is the graph's out-of-rounds note (lib/assistant/graph.ts), not a question.
   * (The chat's earlier turns never contain tool results: only questions and answers are sent back.)
   */
  private seen(messages: BaseMessage[]): Seen {
    const firstResult = messages.findIndex((m) => ToolMessage.isInstance(m));
    const beforeTools = firstResult === -1 ? messages : messages.slice(0, firstResult);
    const questions = beforeTools.filter((m) => HumanMessage.isInstance(m));
    return {
      question: questions.at(-1)?.text ?? "",
      earlier: questions.length - 1,
      results: messages.filter((m): m is ToolMessage => ToolMessage.isInstance(m)),
      outOfRounds: firstResult !== -1 && HumanMessage.isInstance(messages.at(-1)),
    };
  }

  /** Tool calls in LangChain's shape, with ids so each result can be matched to its call */
  private toolCalls(calls: Call[]) {
    return calls.map((c) => ({ ...c, id: `fake-call-${++callNo}`, type: "tool_call" as const }));
  }

  /** The whole answer at once (used by invoke, e.g. the off-topic check) */
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const { text, calls = [] } = this.script(this.seen(messages));
    const message = new AIMessage({ content: text, tool_calls: this.toolCalls(calls) });
    return { generations: [{ message, text }] };
  }

  /** The answer in pieces (used by stream, e.g. the main answer): tool calls in one piece, words one by one */
  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const seen = this.seen(messages);
    const { text, calls = [] } = this.script(seen);
    if (calls.length) {
      // A streamed tool call arrives as "tool call chunks" (its inputs as JSON text); LangChain joins them into tool_calls
      const tool_call_chunks = this.toolCalls(calls).map((c, index) => ({
        name: c.name,
        args: JSON.stringify(c.args),
        id: c.id,
        index,
        type: "tool_call_chunk" as const,
      }));
      yield new ChatGenerationChunk({ text: "", message: new AIMessageChunk({ content: "", tool_call_chunks }) });
    }
    const words = text.match(/\S+\s*/g) ?? [];
    for (const [i, word] of words.entries()) {
      if (seen.question.includes("[cut]") && i === 4) throw new Error("Fake reply cut off halfway");
      await wait(seen.question.includes("[slow]") ? 4000 / words.length : 15);
      options.signal?.throwIfAborted(); // Stop pressed: stop writing, like the real one
      const chunk = new ChatGenerationChunk({ text: word, message: new AIMessageChunk(word) });
      yield chunk;
      // Tells listeners about the new piece, as ChatGoogle does: LangGraph's "messages" stream hears it here
      await runManager?.handleLLMNewToken(word, undefined, undefined, undefined, undefined, { chunk });
    }
  }
}

/** "list_bookings: found, 2 in total": what one tool result said, from its content (what a real model reads) */
function resultText(m: ToolMessage): string {
  try {
    const r = JSON.parse(m.text) as { status: string; data?: { total?: number }; warning?: string };
    return `${m.name}: ${r.status}${typeof r.data?.total === "number" ? `, ${r.data.total} in total` : ""}${r.warning ? ", with a warning" : ""}`;
  } catch {
    return `${m.name}: ${m.text.slice(0, 60)}`; // e.g. an error message from the tools node
  }
}

/** Instead of Gemini answering: tool calls from [tool:…] tags, then a test answer saying what they found */
export function fakeMainModel() {
  return new FakeModel(({ question, earlier, results, outOfRounds }) => {
    const status = /\[fail:(\d{3})\]/.exec(question)?.[1];
    if (status) {
      // Shaped like @langchain/google's errors, so the route's explain() treats it the same way
      throw Object.assign(new Error(`Fake error ${status}`), { name: "RequestError", statusCode: Number(status) });
    }
    const getToday = [{ name: "get_today", args: { plus_days: results.length + 1 } }];
    // [loop]: keeps asking. On the out-of-rounds turn it still asks, with no words, like the misbehaving model in 2.14
    if (question.includes("[loop]")) return { text: "", calls: getToday };
    // First turn of a question with tags: ask for those tools
    const calls = taggedCalls(question);
    if (calls.length && !results.length) return { text: "", calls };
    const used = results.length ? ` Tools used: ${results.map(resultText).join("; ")}.` : "";
    const note = outOfRounds ? " (Out of tool rounds.)" : "";
    return {
      text: `This is a **test answer** (ASSISTANT_FAKE=1), Gemini wasn't asked. You asked: "${question}". Earlier questions in this chat: ${earlier}.${used}${note}`,
    };
  });
}

/**
 * Instead of the off-topic check: BLOCK only when the question says [off-topic]. Like the real check, it
 * judges only the part inside <question>, not the <earlier> question sent along for context.
 */
export function fakeGuardModel() {
  return new FakeModel(({ question: input }) => {
    const question = /<question>([\s\S]*)<\/question>/.exec(input)?.[1] ?? input;
    return { text: question.includes("[off-topic]") ? "BLOCK" : "ALLOW" };
  });
}
