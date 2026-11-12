import type { RunnableConfig } from "@langchain/core/runnables";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { mainModel } from "./model";

/**
 * Annapurna Assist as a LangGraph graph. A graph has three parts:
 * - state: what's passed from step to step. MessagesAnnotation is LangGraph's ready-made one: a list of
 *   messages, where each step's new messages are added to the end (not replacing the list).
 * - nodes: the steps. Each one gets the state and returns what to add to it.
 * - edges: which step runs next.
 *
 * For now there's one node, so the graph does what the route did before:
 *
 *   START → model → END
 *
 * Step 2.4 adds a "tools" node and an edge that loops back to "model" until it has an answer.
 */

/** The "model" node: send all the messages so far to the model, and add its reply to the state */
async function callModel(state: typeof MessagesAnnotation.State, config: RunnableConfig) {
  // `config` carries the Stop signal and LangGraph's listeners (that's how the reply streams out word by word)
  const reply = await mainModel().invoke(state.messages, config);
  return { messages: [reply] };
}

/** Built once when the server starts; each question runs it with its own messages */
export const graph = new StateGraph(MessagesAnnotation)
  .addNode("model", callModel)
  .addEdge(START, "model")
  .addEdge("model", END)
  .compile();
