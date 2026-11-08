import type { ToolDefinition } from "../skills/types.js";

/**
 * (B) brain → ローカルLLM。プロバイダ実装(ollama / home-llm)が従う共通インターフェース。
 */
export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** role:"tool" のときの動作名(2026-11-09仕様の /chat が tool_name として要求する)。 */
  toolName?: string;
  /** role:"assistant" のときの、実際に返ってきたtool_calls(履歴へ再現するため)。 */
  toolCalls?: ToolCall[];
};

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type LLMRequest = {
  system: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
};

export type LLMUsage = {
  promptTokens?: number;
  completionTokens?: number;
};

export type LLMResponse = {
  toolCalls: ToolCall[];
  text?: string;
  usage?: LLMUsage;
};

export interface LLMProvider {
  chat(request: LLMRequest): Promise<LLMResponse>;
}
