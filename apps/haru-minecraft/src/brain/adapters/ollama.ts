import type { ChatMessage, LLMProvider, LLMRequest, LLMResponse, ToolCall } from "../llmProvider.js";

/**
 * 本命/upgrade path: Ollama の OpenAI互換エンドポイント (/v1/chat/completions)。
 * ネイティブの tools パラメータを使う — Shannon記事の教訓どおり、
 * プロンプトに全ツール定義を埋め込む(巨大JSONプラン方式)はしない。
 */
export class OllamaProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly token: string = ""
  ) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const messages = [{ role: "system", content: request.system }, ...toOpenAiMessages(request.messages)];

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: request.tools.map((tool) => ({
          type: "function",
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        })),
        tool_choice: "auto",
        max_tokens: request.maxTokens,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Ollama /v1/chat/completions がエラーを返した (status: ${response.status})`);
    }

    const json = (await response.json()) as OpenAiChatCompletion;
    return parseOpenAiResponse(json);
  }
}

function toOpenAiMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

type OpenAiToolCall = {
  function: { name: string; arguments: string };
};

type OpenAiChatCompletion = {
  choices: Array<{
    message: {
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function parseOpenAiResponse(json: OpenAiChatCompletion): LLMResponse {
  const message = json.choices[0]?.message;
  const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((call) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments) as Record<string, unknown>;
    } catch {
      args = {};
    }
    return { name: call.function.name, args };
  });

  return {
    toolCalls,
    text: message?.content ?? undefined,
    usage: json.usage
      ? { promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens }
      : undefined,
  };
}
