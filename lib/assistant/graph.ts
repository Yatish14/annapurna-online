import { AIMessage, type BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { RunnableConfig } from "@langchain/core/runnables";
import { type BaseCheckpointSaver, END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { mainModel } from "./model";
import { PhoneBook } from "./phones";
import { isStrict, strictContent } from "./privacy";
import type { ToolResult } from "./tools/result";
import { TOOLS } from "./tools";

/**
 * Annapurna Assist as a LangGraph graph. A graph has three parts:
 * - state: what's passed from step to step. MessagesAnnotation is LangGraph's ready-made one: a list of
 *   messages, where each step's new messages are added to the end (not replacing the list).
 * - nodes: the steps. Each one gets the state and returns what to add to it.
 * - edges: which step runs next. A conditional edge picks the next step by looking at the state.
 *
 * The agent loop (often called ReAct: reason, then act):
 *
 *   START → model ─ asked for tools? ─ yes → tools ─┐
 *             ↑            │                        │
 *             │            no → END                 │
 *             └─────────────────────────────────────┘
 *
 * The model reads the messages and either answers, or asks for tools. If it asked, the tools node runs
 * them and adds their results to the messages, and the model gets another turn, now with the results.
 * It goes round until the model answers without asking for a tool.
 *
 * Loop safety (2.14), enforced by our code, not left to the model:
 * - gentle: after MAX_TOOL_ROUNDS rounds of tools for one question, the model gets one more turn with NO tools
 *   offered, so it answers with what it found instead of asking again (a model can get stuck asking). And the
 *   edge after the model won't go back to the tools once the rounds are used up, whatever the model returns.
 *   (Gemini's own "don't call tools" setting, tool_choice "none", was tried first: on 12 Nov 2026 Gemini 3.5
 *   Flash-Lite still called a tool with it on. A model setting isn't a guarantee.)
 * - hard: RECURSION_LIMIT steps for the whole run (LangGraph's own limit; its default is 25). If something still
 *   goes round past it, LangGraph stops the run with a GraphRecursionError, which the route explains.
 */

/** Rounds of tools one question may use. Real questions so far needed 1 or 2 (a list, then one booking). */
export const MAX_TOOL_ROUNDS = 4;

/** Every round is 2 steps (model, tools), plus the final answer and a little room: 4 rounds → 11 */
export const RECURSION_LIMIT = MAX_TOOL_ROUNDS * 2 + 3;

/** How many times the model has asked for tools since the admin's latest question */
function toolRounds(messages: BaseMessage[]): number {
  const question = messages.findLastIndex((m) => HumanMessage.isInstance(m));
  return messages.slice(question + 1).filter((m) => AIMessage.isInstance(m) && (m.tool_calls?.length ?? 0) > 0).length;
}

/** Sent with the last turn only (never saved in the chat), so the model knows why it has no tools */
const OUT_OF_ROUNDS =
  "You've used all your lookups for this question. Answer now from the tool results above. If part of the " +
  "question still needed a lookup, say you didn't get to check it this time (not that you can't), so the admin " +
  "can ask for it on its own. Don't ask for any more tools.";

/** Said instead, if the last turn still has no words (e.g. it tried to call a tool anyway) */
const STOPPED =
  "I looked things up several times for this and stopped there, to keep it quick. Try asking for one thing at a time.";

/**
 * The graph, with a limit on rounds of tools. The app uses MAX_TOOL_ROUNDS (`graph` below); tests build one with
 * a smaller limit, so the out-of-rounds path runs every time instead of waiting for the model to get stuck.
 *
 * `checkpointer`: only for comparing LangGraph's own memory with our saved chats (5.9, docs/assistant-checkpointer.md).
 * The app passes none: each question runs with the history it's given (lib/assistant/history.ts).
 *
 * `model`: which model answers. The app uses mainModel(); the eval runner (evals/run.ts, Step 8) passes others, to
 * compare models or to replay recorded answers.
 */
export function buildGraph(maxRounds = MAX_TOOL_ROUNDS, checkpointer?: BaseCheckpointSaver, model: () => BaseChatModel = mainModel) {
  /** The "model" node: send all the messages so far to the model, with the list of tools it may ask for */
  async function callModel(state: typeof MessagesAnnotation.State, config: RunnableConfig) {
    // `config` carries the Stop signal and LangGraph's listeners (that's how the reply streams out word by word).
    // The model never gets a phone number, only its label ("[phone 1]", lib/assistant/phones.ts). The state keeps
    // the real numbers; the tools step puts them back into the model's tool calls.
    const sent = new PhoneBook().maskMessages(state.messages);
    if (toolRounds(state.messages) < maxRounds) {
      // bindTools: the tools' names, descriptions and inputs go with every request, so the model knows what it can ask for
      const reply = await model().bindTools!(TOOLS).invoke(sent, config);
      return { messages: [reply] };
    }
    // Out of tool rounds: no tools offered, and a note saying so
    const reply = await model().invoke([...sent, new HumanMessage(OUT_OF_ROUNDS)], config);
    // Its words (already streamed to the admin) are the answer. If it has none, or still asks for a tool, our code
    // answers instead, and drops the tool call so no chip spins for a tool that will never run.
    if (reply.text.trim() && !reply.tool_calls?.length) return { messages: [reply] };
    return { messages: [new AIMessage(STOPPED)] };
  }

  /** After the model: its tool calls go to "tools" (toolsCondition), unless this question's rounds are used up */
  function afterModel(state: typeof MessagesAnnotation.State) {
    if (toolRounds(state.messages) > maxRounds) return END;
    return toolsCondition(state);
  }

  /**
   * The "tools" node: LangGraph's ready-made ToolNode runs each tool call in the model's last message (checking the
   * inputs against the tool's zod schema first) and adds a ToolMessage per result. In privacy-first mode (Step 9)
   * each ToolMessage's content, what the model reads, is swapped for strictContent (lib/assistant/privacy.ts); its
   * artifact, the full result the cards are made from, stays whole and never goes to the model.
   */
  const toolNode = new ToolNode(TOOLS);
  async function runTools(state: typeof MessagesAnnotation.State, config: RunnableConfig) {
    // The model asked with labels ("[phone 1]"): the tools get the real numbers. The labels are worked out from the
    // same messages the model step masked, so they mean the same numbers.
    const book = PhoneBook.from(state.messages);
    const asked = state.messages.at(-1);
    const real =
      asked && AIMessage.isInstance(asked) && asked.tool_calls?.length
        ? [
            ...state.messages.slice(0, -1),
            new AIMessage({
              content: asked.content,
              tool_calls: asked.tool_calls.map((c) => ({ ...c, args: book.unmaskArgs(c.args) })),
              additional_kwargs: asked.additional_kwargs,
              response_metadata: asked.response_metadata,
              id: asked.id,
            }),
          ]
        : state.messages;
    const out = (await toolNode.invoke({ messages: real }, config)) as { messages: BaseMessage[] };
    if (!isStrict()) return out;
    return {
      messages: out.messages.map((m) =>
        ToolMessage.isInstance(m)
          ? new ToolMessage({
              content: strictContent(m.name ?? "", m.text, m.artifact as ToolResult<unknown> | undefined),
              artifact: m.artifact,
              tool_call_id: m.tool_call_id,
              name: m.name,
              status: m.status,
            })
          : m,
      ),
    };
  }

  return (
    new StateGraph(MessagesAnnotation)
      .addNode("model", callModel)
      .addNode("tools", runTools)
      .addEdge(START, "model")
      // After the model: toolsCondition looks at its last message. Tool calls → "tools"; none → END (the answer).
      // afterModel also says END once the rounds are used up.
      .addConditionalEdges("model", afterModel, ["tools", END])
      // After the tools: back to the model, which now sees the results
      .addEdge("tools", "model")
      .compile({ checkpointer })
  );
}

/** Built once when the server starts; each question runs it with its own messages */
export const graph = buildGraph();
