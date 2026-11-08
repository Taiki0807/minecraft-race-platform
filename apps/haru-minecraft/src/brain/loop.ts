import type { BridgeClient } from "../bridge/client.js";
import type { SayKind } from "../bridge/types.js";
import type { JsonlLogger } from "../logging/jsonl.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { SkillResult } from "../skills/types.js";
import type { ChatMessage, LLMProvider, ToolCall } from "./llmProvider.js";

export type ExecutedTool = {
  name: string;
  args: Record<string, unknown>;
  result: SkillResult;
};

export type JudgmentCycleResult = {
  toolCalls: ToolCall[];
  executed: ExecutedTool[];
  spoke: string[];
  text?: string;
};

export type JudgmentCycleOptions = {
  llm: LLMProvider;
  registry: SkillRegistry;
  bot: unknown;
  system: string;
  history: ChatMessage[];
  maxTokens?: number;
  bridge: Pick<BridgeClient, "sendEvent">;
  logger: JsonlLogger;
  sessionId: string;
  speakKind?: SayKind;
};

/**
 * 1回の判断サイクル: LLMへ状態を渡して判断させ、tool_calls を実行する。
 *
 * 発話の扱いは2経路ある:
 *  - 2026-11-09仕様改定版の /chat(HaruChatProvider)は、話す内容を応答の content に
 *    直接入れてくる(toolの形ではない)。response.text があれば常に(A)のsayイベントへ送る。
 *  - 旧い互換モード(ollama/home-llm)が speak という名前のツールを呼んできた場合も、
 *    後方互換として同じくsayイベントへ変換する(ゲーム内では実行しない)。
 * それ以外のツールは SkillRegistry.execute に委譲し、結果をそのままログへ残す
 * (ツール実行結果のmessageが次の判断の環境フィードバックになる)。
 */
export async function runJudgmentCycle(opts: JudgmentCycleOptions): Promise<JudgmentCycleResult> {
  const response = await opts.llm.chat({
    system: opts.system,
    messages: opts.history,
    tools: opts.registry.listToolDefinitions(),
    maxTokens: opts.maxTokens,
  });

  await opts.logger.log("decision", opts.sessionId, {
    toolCalls: response.toolCalls,
    text: response.text ?? null,
  });

  const executed: ExecutedTool[] = [];
  const spoke: string[] = [];

  async function speak(text: string): Promise<void> {
    spoke.push(text);
    await opts.logger.log("speak", opts.sessionId, { text });
    await opts.bridge.sendEvent({ type: "say", payload: { text, kind: opts.speakKind ?? "intent" } });
  }

  if (response.text) {
    await speak(response.text);
  }

  for (const call of response.toolCalls) {
    if (call.name === "speak") {
      const text = typeof call.args.text === "string" ? call.args.text : "";
      await speak(text);
      continue;
    }

    await opts.logger.log("tool_call", opts.sessionId, { name: call.name, args: call.args });
    const result = await opts.registry.execute(call.name, { bot: opts.bot }, call.args);
    await opts.logger.log("tool_result", opts.sessionId, { name: call.name, result });
    executed.push({ name: call.name, args: call.args, result });
  }

  return { toolCalls: response.toolCalls, executed, spoke, text: response.text };
}
