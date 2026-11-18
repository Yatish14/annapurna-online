import { BaseChatModel, type BindToolsInput } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

/**
 * A pretend model that gives back, turn by turn, what a real model said in an earlier eval run (8.12). The graph and
 * the tools still run for real, on the eval database; only the model's words and tool calls come from the recording.
 * So CI can run the whole eval set for free on every push: if a change breaks a tool, a grader or a case, it shows.
 * (It can't show whether the model would still choose well after a prompt change: that needs a real run.)
 */

export type Turn = { text: string; toolCalls: { name: string; args: Record<string, unknown> }[] };

let callNo = 0;

export class ReplayModel extends BaseChatModel {
  private turns: Turn[] = [];

  constructor() {
    super({});
  }

  _llmType() {
    return "annapurna-replay";
  }

  /** The recorded turns for the next case */
  load(turns: Turn[]) {
    this.turns = [...turns];
  }

  /** The recording already has the tool calls; the tools offered make no difference */
  bindTools(_tools: BindToolsInput[]) {
    return this;
  }

  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    const turn = this.turns.shift() ?? { text: "(The recording has no more turns.)", toolCalls: [] };
    const message = new AIMessage({
      content: turn.text,
      tool_calls: turn.toolCalls.map((c) => ({ ...c, id: `replay-${++callNo}`, type: "tool_call" as const })),
    });
    return { generations: [{ message, text: turn.text }] };
  }
}
