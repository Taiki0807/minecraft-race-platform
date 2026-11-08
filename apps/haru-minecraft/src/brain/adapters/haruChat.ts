import type { ToolDefinition } from "../../skills/types.js";
import type { ChatMessage, LLMProvider, LLMRequest, LLMResponse, ToolCall } from "../llmProvider.js";

/**
 * 2026-11-09の仕様改定版 /chat(ネイティブのtools/tool_calls対応)。
 *
 * これは「新しいFastAPIサービス」ではなく、既存の home-llm(/chat, chat.hosokawa-lab.dev)
 * **そのもの**がネイティブのツール呼び出しに対応した結果の契約。homeLlm.ts
 * (JSON指示埋め込みの互換モード)は改定前の古い契約向けの実装で、今はこちらが本来の経路。
 *
 * OpenAI形式とも、旧home-llm互換モードとも違う点(実際の仕様書より):
 *  - レスポンスの tool_calls は {name, arguments} のフラットな形(.functionでネストしない)。
 *    arguments は既にオブジェクト(JSON文字列ではない、parseが要らない)
 *  - 履歴へ戻すassistantメッセージのtool_callsは {function:{name,arguments}} で
 *    ラップし直す必要がある(リクエスト側の表現だけOpenAI形式のまま)
 *  - toolロールのメッセージは tool_name フィールドで動作名を持つ(tool_call_idではない)
 *  - tools を渡すときはtemperatureを0.3以下に抑える(仕様で明記、小さいモデルの脱線対策)
 *  - 指示が無いときは autonomous:true を付けて呼ぶと、ハルが自分で次の行動を決める
 */
export class HaruChatProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly autonomous: boolean = true
  ) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const messages = [
      { role: "system", content: request.system },
      ...toHaruChatMessages(request.messages),
    ];

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        messages,
        tools: request.tools.map(toHaruChatTool),
        // 仕様: toolsがあるときは0.3を超える値は0.3に抑える。常にtoolsを渡すので常に0.3。
        temperature: 0.3,
        max_new_tokens: request.maxTokens ?? 512,
        stream: false,
        ...(this.autonomous ? { autonomous: true } : {}),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(
        `haru /chat がエラーを返した (status: ${response.status}${detail?.detail ? `, ${detail.detail}` : ""})`
      );
    }

    const json = (await response.json()) as HaruChatResponse;
    const toolCalls: ToolCall[] = (json.tool_calls ?? []).map((call) => ({
      name: call.name,
      args: call.arguments ?? {},
    }));

    return { toolCalls, text: json.content || undefined };
  }
}

function toHaruChatTool(tool: ToolDefinition) {
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

/**
 * 履歴をこの契約の形に変換する。
 * - assistant に toolCalls があれば {function:{name,arguments}} でラップし直して戻す
 * - tool は tool_name に動作名を入れる
 */
function toHaruChatMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.args } })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_name: m.toolName ?? "", content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

type HaruChatResponse = {
  content?: string | null;
  tool_calls?: Array<{ name: string; arguments?: Record<string, unknown> }>;
  adapter?: string | null;
  model?: string;
};
