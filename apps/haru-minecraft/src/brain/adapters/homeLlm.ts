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
        // 実機検証で判明: temperatureが高いとJSON形式を無視して自由な感想文だけを
        // 返すことが多く、行動(ツール呼び出し)にほぼ繋がらなかった。下げて
        // 指示への追従性を優先する(個性のゆらぎは多少失うトレードオフ)。
        temperature: 0.4,
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

/**
 * 実機で確認済み: home-llm の /chat は role を "system"|"user"|"assistant" しか
 * 受け付けず(local-ai-creator-studio/lib/ai/local-llm.ts の Message型と一致)、
 * それ以外(ここでは"tool": ツール実行結果のフィードバック)を送ると422で拒否される。
 * ツール結果は環境からの観測として"user"に寄せる。
 */
function toHomeLlmMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "tool" ? "user" : m.role,
    content: m.content,
  }));
}

function buildSystemWithToolInstructions(system: string, tools: ToolDefinition[]): string {
  const toolList = tools
    .map((tool) => `- ${tool.name}(${JSON.stringify(tool.parameters.properties)}): ${tool.description}`)
    .join("\n");

  // 実機検証で判明: 指示だけでは自由な感想文(JSON無し)を返すことが多く、
  // speak以外のツールをほぼ選ばなかった。小さいモデルには具体例(few-shot)が
  // 一番効くため、状況→出力の対応例を1つ入れる。
  return [
    system,
    "",
    "[出力形式(厳守)]",
    "次の1個のJSONオブジェクトだけを出力する。説明文や前置き、JSON以外の文章は書かない。",
    '{"tool_calls":[{"name":"ツール名","args":{...}}],"text":"任意の一言(省略可)"}',
    "",
    "[出力例]",
    "状況: 近くにクリーパーがいる、何も持っていない",
    '出力: {"tool_calls":[{"name":"speak","args":{"text":"クリーパーがいるな、離れよう"}},{"name":"move_to","args":{"x":10,"y":64,"z":-5}}]}',
    "",
    "[重要] speakで喋るだけで終わらせない。状況を見て、move_to・collect・dig_block等の",
    "行動ツールも毎回できるだけ1つ選ぶこと。tool_callsを空配列にするのは、",
    "本当に何も選べない時だけにする。",
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

  const parsed = tryParseHomeLlmJson(jsonText) ?? tryParseHomeLlmJson(repairUnbalancedBrackets(jsonText));
  if (!parsed) {
    return { toolCalls: [], text: content };
  }
  return parsed;
}

function tryParseHomeLlmJson(jsonText: string): LLMResponse | null {
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
    return null;
  }
}

/**
 * 小さいモデルは配列の `]` を書き忘れて、代わりに `}` を1つ多く出すなど、
 * 括弧の対応を間違えることがある(実機検証で確認済み: tool_calls配列の
 * 要素を書き終えた後、`]` を書かずに `}` を出してオブジェクトを閉じようとするケース)。
 * 文字列リテラルの中は数えない。対応しない閉じ括弧(モデルの書き間違い)は
 * 捨て、最後まで開いたままの `{`/`[` だけを末尾に補って再試行する。
 */
function repairUnbalancedBrackets(text: string): string {
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escaped = false;
  let repaired = "";

  for (const ch of text) {
    if (inString) {
      repaired += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      repaired += ch;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      repaired += ch;
      continue;
    }

    if (ch === "}" || ch === "]") {
      const expected = ch === "}" ? "{" : "[";
      if (stack[stack.length - 1] === expected) {
        stack.pop();
        repaired += ch;
      }
      // 対応する開き括弧が無い閉じ括弧は、モデルの書き間違いとして読み飛ばす。
      continue;
    }

    repaired += ch;
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === "{" ? "}" : "]";
  }
  return repaired;
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
