import type { ToolDefinition } from "../../skills/types.js";
import type { ChatMessage, LLMProvider, LLMRequest, LLMResponse, ToolCall } from "../llmProvider.js";

/**
 * 現在稼働中のローカルLLM(Taikiの /chat)用アダプタ。
 *
 * 実コントラクトは { messages, max_new_tokens, temperature } -> { content, adapter } の
 * プレーンテキスト補完のみで、ネイティブのtools/tool_callsは持たない
 * (local-ai-creator-studio/lib/ai/local-llm.ts で確認済み)。
 *
 * そのため、ツール定義をJSON指示としてプロンプトに埋め込み、モデルには
 * 1個のJSONオブジェクトだけを返すよう指示し、それをパースする互換モードで実装する。
 * 仕様が明記するとおり、この方式の実用性(精度・安定性)はPhase 1での
 * 実機検証が必要 — ここではパースロジックと配線のみを提供する。
 */
export class HomeLlmProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number
  ) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const systemWithTools = buildSystemWithToolInstructions(request.system, request.tools);
    const messages = [{ role: "system", content: systemWithTools }, ...toHomeLlmMessages(request.messages)];

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        messages,
        max_new_tokens: request.maxTokens ?? 256,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`home-llm /chat がエラーを返した (status: ${response.status})`);
    }

    const json = (await response.json()) as { content?: string };
    return parseHomeLlmContent(json.content ?? "");
  }
}

function toHomeLlmMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function buildSystemWithToolInstructions(system: string, tools: ToolDefinition[]): string {
  const toolList = tools
    .map((tool) => `- ${tool.name}(${JSON.stringify(tool.parameters.properties)}): ${tool.description}`)
    .join("\n");

  return [
    system,
    "",
    "[出力形式]",
    "次の1個のJSONオブジェクトだけを出力すること。説明文や前後の文章は書かない。",
    '{"tool_calls":[{"name":"ツール名","args":{...}}],"text":"任意の一言(省略可)"}',
    "ツールを使わない場合は tool_calls を空配列にする。",
    "",
    "[使えるツール]",
    toolList,
  ].join("\n");
}

type HomeLlmJson = {
  tool_calls?: Array<{ name?: unknown; args?: unknown }>;
  text?: unknown;
};

/** モデル出力からJSON部分を取り出してパースする。失敗時はツール無し応答として扱う。 */
export function parseHomeLlmContent(content: string): LLMResponse {
  const jsonText = extractFirstJsonObject(content);
  if (!jsonText) {
    return { toolCalls: [], text: content };
  }

  try {
    const parsed = JSON.parse(jsonText) as HomeLlmJson;
    const toolCalls: ToolCall[] = (parsed.tool_calls ?? [])
      .filter((call) => typeof call.name === "string")
      .map((call) => ({
        name: call.name as string,
        args: (typeof call.args === "object" && call.args !== null ? call.args : {}) as Record<
          string,
          unknown
        >,
      }));
    return { toolCalls, text: typeof parsed.text === "string" ? parsed.text : undefined };
  } catch {
    return { toolCalls: [], text: content };
  }
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
