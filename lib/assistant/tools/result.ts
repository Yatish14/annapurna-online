/**
 * What every Annapurna Assist tool returns: two things (docs/assistant-plan.md, design decision 6).
 * - status: a short word the model can always be told (found / none / too_many / failed)
 * - data: the details, for the screen (cards, from 2.13) and, in normal mode, for the model too
 *
 * Tools use LangChain's responseFormat "content_and_artifact": a tool returns a pair,
 * [what the model reads, what stays with our code]. The second part (the "artifact") never goes to the model.
 * Today the model reads the status and the data (sample data, local only). Privacy-first mode (Step 9)
 * changes only toolReply() below, so the model reads the status alone; no tool needs rewriting.
 */

export type ToolStatus = "found" | "none" | "too_many" | "failed";

export type ToolResult<T> = {
  status: ToolStatus;
  data: T;
  /** A short hint for the model, e.g. "Showing the first 20 of 57" */
  note?: string;
};

/** Turns a tool's result into LangChain's [content for the model, artifact for our code] pair */
export function toolReply<T>(result: ToolResult<T>): [string, ToolResult<T>] {
  return [JSON.stringify(result), result];
}
