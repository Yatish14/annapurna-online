import type { RunnableConfig } from "@langchain/core/runnables";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { mainModel } from "./model";
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
 * It goes round until the model answers without asking for a tool. (LangGraph stops any run after 25
 * steps by default; 2.14 sets our own limit.)
 */

/** The "model" node: send all the messages so far to the model, with the list of tools it may ask for */
async function callModel(state: typeof MessagesAnnotation.State, config: RunnableConfig) {
  // bindTools: the tools' names, descriptions and inputs go with every request, so the model knows what it can ask for.
  // `config` carries the Stop signal and LangGraph's listeners (that's how the reply streams out word by word).
  const reply = await mainModel().bindTools(TOOLS).invoke(state.messages, config);
  return { messages: [reply] };
}

/** Built once when the server starts; each question runs it with its own messages */
export const graph = new StateGraph(MessagesAnnotation)
  .addNode("model", callModel)
  // LangGraph's ready-made tools node: for each tool call in the model's last message, it checks the inputs
  // against the tool's zod schema, runs the tool, and adds a ToolMessage with the result
  .addNode("tools", new ToolNode(TOOLS))
  .addEdge(START, "model")
  // After the model: toolsCondition looks at its last message. Tool calls → "tools"; none → END (the answer)
  .addConditionalEdges("model", toolsCondition, ["tools", END])
  // After the tools: back to the model, which now sees the results
  .addEdge("tools", "model")
  .compile();
