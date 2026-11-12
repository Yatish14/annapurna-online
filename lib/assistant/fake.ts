import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { BaseChatModel, type BindToolsInput } from "@langchain/core/language_models/chat_models";
import { AIMessage, AIMessageChunk, type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";

/**
 * Pretend models for tests and for trying the UI (ASSISTANT_FAKE=1 in .env.local). They never call Google:
 * free, instant, no API key needed, and the same question always gets the same answer, so a test can check
 * the exact words. Any LangChain chat model is a class with these two methods: one for the whole answer
 * (invoke) and one for the answer in pieces (stream). The rest (messages, signals, callbacks) LangChain adds.
 *
 * Words in a question that make the fake misbehave, to test the error handling without waiting for real errors:
 *   [off-topic]   the off-topic check says BLOCK
 *   [fail:429]    fails before the first word with that status (429 rate limit, 500 Google down, 401 bad key…)
 *   [cut]         fails after a few words, like a reply cut off halfway
 *   [slow]        writes slowly (about 4 s), so there's time to press Stop
 */

type Answer = (question: string, earlier: number) => string;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeModel extends BaseChatModel {
  private answer: Answer;

  constructor(answer: Answer) {
    super({});
    this.answer = answer;
  }

  _llmType() {
    return "annapurna-fake";
  }

  /** The graph offers the model its tools. The fake never asks for one, so it ignores them (2.16 adds scripted tool calls). */
  bindTools(_tools: BindToolsInput[]) {
    return this;
  }

  /** The question is the last HumanMessage; `earlier` counts the questions before it (to test history) */
  private reply(messages: BaseMessage[]) {
    const questions = messages.filter((m) => m instanceof HumanMessage);
    const question = questions.at(-1)?.text ?? "";
    return { question, text: this.answer(question, questions.length - 1) };
  }

  /** The whole answer at once (used by invoke, e.g. the off-topic check) */
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const { text } = this.reply(messages);
    return { generations: [{ message: new AIMessage(text), text }] };
  }

  /** The answer word by word (used by stream, e.g. the main answer) */
  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const { question, text } = this.reply(messages);
    const words = text.match(/\S+\s*/g) ?? [];
    for (const [i, word] of words.entries()) {
      if (question.includes("[cut]") && i === 4) throw new Error("Fake reply cut off halfway");
      await wait(question.includes("[slow]") ? 4000 / words.length : 15);
      options.signal?.throwIfAborted(); // Stop pressed: stop writing, like the real one
      const chunk = new ChatGenerationChunk({ text: word, message: new AIMessageChunk(word) });
      yield chunk;
      // Tells listeners about the new piece, as ChatGoogle does: LangGraph's "messages" stream hears it here
      await runManager?.handleLLMNewToken(word, undefined, undefined, undefined, undefined, { chunk });
    }
  }
}

/** Instead of Gemini answering: says it's a test, repeats the question and how many came before it */
export function fakeMainModel() {
  return new FakeModel((question, earlier) => {
    const status = /\[fail:(\d{3})\]/.exec(question)?.[1];
    if (status) {
      // Shaped like @langchain/google's errors, so the route's explain() treats it the same way
      throw Object.assign(new Error(`Fake error ${status}`), { name: "RequestError", statusCode: Number(status) });
    }
    return `This is a **test answer** (ASSISTANT_FAKE=1), Gemini wasn't asked. You asked: "${question}". Earlier questions in this chat: ${earlier}.`;
  });
}

/**
 * Instead of the off-topic check: BLOCK only when the question says [off-topic]. Like the real check, it
 * judges only the part inside <question>, not the <earlier> question sent along for context.
 */
export function fakeGuardModel() {
  return new FakeModel((input) => {
    const question = /<question>([\s\S]*)<\/question>/.exec(input)?.[1] ?? input;
    return question.includes("[off-topic]") ? "BLOCK" : "ALLOW";
  });
}
