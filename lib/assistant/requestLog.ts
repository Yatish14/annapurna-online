import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import { query } from "@/lib/db";

/**
 * The usage log (8.1): what each question used, saved in assistant_requests. Server only.
 *
 * LangChain tells "callbacks" about everything that runs: a callback handler is a class with methods like
 * handleChatModelStart and handleLLMEnd, and LangChain calls them for every model call made with it in the config,
 * however deep inside the graph. So one UsageRecorder passed to the graph, the off-topic check and the title writer
 * hears every model call a question makes, with the token counts Gemini reported (usage_metadata).
 */

/** Why a model was called: tags on the call say (guard.ts and titles.ts tag theirs); untagged calls are the answer */
export type Purpose = "answer" | "guard" | "title";

export type ModelCall = {
  model: string;
  purpose: Purpose;
  /** Tokens sent, including the system prompt and the tools' descriptions */
  input: number;
  /** Tokens written, including thinking (billed as output) */
  output: number;
  /** Input tokens Google had cached from an earlier call with the same start (cheaper, 8.11) */
  cached: number;
  /** Of the output, tokens spent thinking before answering */
  thinking: number;
};

export class UsageRecorder extends BaseCallbackHandler {
  name = "annapurna-usage";
  calls: ModelCall[] = [];
  private started = new Map<string, { model: string; purpose: Purpose }>();

  /** A model call starts: note which model (LangChain puts its name in the metadata) and why */
  async handleChatModelStart(
    llm: Serialized,
    _messages: BaseMessage[][],
    runId: string,
    _parentRunId?: string,
    _extra?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ) {
    const purpose: Purpose = tags?.includes("guard") ? "guard" : tags?.includes("title") ? "title" : "answer";
    const model = String(metadata?.ls_model_name ?? (llm as { kwargs?: { model?: string } }).kwargs?.model ?? "unknown");
    this.started.set(runId, { model, purpose });
  }

  /** It ended: Gemini's token counts are on the reply message */
  async handleLLMEnd(output: LLMResult, runId: string) {
    const start = this.started.get(runId);
    this.started.delete(runId);
    const generation = output.generations[0]?.[0] as { message?: { usage_metadata?: UsageMetadata } } | undefined;
    const usage = generation?.message?.usage_metadata;
    this.calls.push({
      model: start?.model ?? "unknown",
      purpose: start?.purpose ?? "answer",
      input: usage?.input_tokens ?? 0,
      output: usage?.output_tokens ?? 0,
      cached: usage?.input_token_details?.cache_read ?? 0,
      thinking: usage?.output_token_details?.reasoning ?? 0,
    });
  }
}

type UsageMetadata = {
  input_tokens?: number;
  output_tokens?: number;
  input_token_details?: { cache_read?: number };
  output_token_details?: { reasoning?: number };
};

export type Outcome = "answered" | "off_topic" | "stopped" | "failed";

/** Saves one question's row. Never throws: a usage row isn't worth failing an answer over. */
export async function logRequest(row: {
  userId: number;
  chatId: string;
  outcome: Outcome;
  model: string;
  calls: ModelCall[];
  tools: string[];
  firstTextMs: number | null;
  totalMs: number;
}): Promise<void> {
  const sum = (key: "input" | "output" | "cached") => row.calls.reduce((n, c) => n + c[key], 0);
  try {
    await query(
      `INSERT INTO assistant_requests (user_id, chat_id, outcome, model, calls, input_tokens, output_tokens, cached_tokens,
                                       tools, first_text_ms, total_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        row.userId,
        row.chatId,
        row.outcome,
        row.model,
        JSON.stringify(row.calls),
        sum("input"),
        sum("output"),
        sum("cached"),
        row.tools,
        row.firstTextMs,
        row.totalMs,
      ],
    );
  } catch (err) {
    console.error("Annapurna Assist: couldn't save the usage row", err);
  }
}
