import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider, parseOpenAiResponse } from "../src/brain/adapters/ollama.js";
import { HomeLlmProvider, parseHomeLlmContent } from "../src/brain/adapters/homeLlm.js";
import { HaruChatProvider } from "../src/brain/adapters/haruChat.js";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("parseOpenAiResponse (ollama adapter)", () => {
  it("parses native tool_calls with JSON-string arguments", () => {
    const result = parseOpenAiResponse({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ function: { name: "move_to", arguments: '{"x":1,"y":64,"z":2}' } }],
          },
        },
      ],
    });
    expect(result.toolCalls).toEqual([{ name: "move_to", args: { x: 1, y: 64, z: 2 } }]);
  });

  it("falls back to empty args when arguments JSON is malformed", () => {
    const result = parseOpenAiResponse({
      choices: [{ message: { tool_calls: [{ function: { name: "wait", arguments: "{not json" } }] } }],
    });
    expect(result.toolCalls).toEqual([{ name: "wait", args: {} }]);
  });

  it("returns text with no tool_calls when the model just talks", () => {
    const result = parseOpenAiResponse({ choices: [{ message: { content: "うーん" } }] });
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toBe("うーん");
  });

  it("carries usage through when present", () => {
    const result = parseOpenAiResponse({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });
});

describe("OllamaProvider (sends Authorization like the FastAPI spec requires)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a Bearer token header when a token is configured", async () => {
    const provider = new OllamaProvider("http://127.0.0.1:11434", "qwen2.5:14b", 1000, "secret-token");
    await provider.chat({ system: "s", messages: [], tools: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/v1/chat/completions",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret-token" }) })
    );
  });

  it("omits the Authorization header when no token is configured", async () => {
    const provider = new OllamaProvider("http://127.0.0.1:11434", "qwen2.5:14b", 1000);
    await provider.chat({ system: "s", messages: [], tools: [] });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("HomeLlmProvider (role mapping, real backend only accepts system/user/assistant)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: "{}" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a "tool" role message to "user" (observed in production: real /chat rejects "tool" with 422)', async () => {
    const provider = new HomeLlmProvider("http://127.0.0.1:8000", "", 1000);
    await provider.chat({
      system: "s",
      messages: [
        { role: "tool", content: "move_to: ok - 到着した" },
        { role: "assistant", content: "ok" },
      ],
      tools: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { messages: Array<{ role: string }> };
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });

  it("embeds a few-shot example and an explicit nudge toward choosing an action tool, not just speak", async () => {
    const provider = new HomeLlmProvider("http://127.0.0.1:8000", "", 1000);
    await provider.chat({ system: "persona", messages: [], tools: [] });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemContent = body.messages[0]?.content ?? "";
    expect(systemContent).toContain("[出力例]");
    expect(systemContent).toContain("move_to");
    expect(systemContent).toContain("speakで喋るだけで終わらせない");
  });

  it("lowers temperature for more reliable JSON-format compliance", async () => {
    const provider = new HomeLlmProvider("http://127.0.0.1:8000", "", 1000);
    await provider.chat({ system: "s", messages: [], tools: [] });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { temperature: number };
    expect(body.temperature).toBe(0.4);
  });
});

describe("parseHomeLlmContent (home-llm compatibility mode)", () => {
  it("parses a clean single JSON object", () => {
    const result = parseHomeLlmContent('{"tool_calls":[{"name":"wait","args":{"seconds":5}}],"text":"ちょっと待つ"}');
    expect(result.toolCalls).toEqual([{ name: "wait", args: { seconds: 5 } }]);
    expect(result.text).toBe("ちょっと待つ");
  });

  it("extracts the JSON object even when wrapped in prose", () => {
    const result = parseHomeLlmContent(
      '了解です。\n{"tool_calls":[{"name":"eat","args":{}}]}\nよろしくお願いします。'
    );
    expect(result.toolCalls).toEqual([{ name: "eat", args: {} }]);
  });

  it("treats unparsable output as a no-tool response instead of throwing", () => {
    const result = parseHomeLlmContent("ごめん、よくわからない");
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toBe("ごめん、よくわからない");
  });

  it("repairs a real failure seen in production: model forgot to close the tool_calls array", () => {
    // 実機のログに実際に出た壊れたJSON(]を書かずにオブジェクトを閉じようとした)。
    const broken =
      '{"tool_calls":[{"name":"speak","args":{"text":"周りには敵が結構いるな。どこか安全な場所を探さないとな。"}},' +
      '{"name":"move_to","args":{"x":281.5,"y":82,"z":648.5}}}';
    const result = parseHomeLlmContent(broken);
    expect(result.toolCalls).toEqual([
      { name: "speak", args: { text: "周りには敵が結構いるな。どこか安全な場所を探さないとな。" } },
      { name: "move_to", args: { x: 281.5, y: 82, z: 648.5 } },
    ]);
  });

  it("does not mistake brackets inside a string value for structural brackets when repairing", () => {
    const broken = '{"tool_calls":[{"name":"speak","args":{"text":"括弧{}や[]を含む発言"}}}';
    const result = parseHomeLlmContent(broken);
    expect(result.toolCalls).toEqual([{ name: "speak", args: { text: "括弧{}や[]を含む発言" } }]);
  });

  it("ignores tool_calls entries missing a string name", () => {
    const result = parseHomeLlmContent('{"tool_calls":[{"args":{}},{"name":"eat","args":{}}]}');
    expect(result.toolCalls).toEqual([{ name: "eat", args: {} }]);
  });
});

describe("HaruChatProvider (2026-11-09 native tool-calling /chat contract)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ content: "よし、木を集めてくるね。", tool_calls: [{ name: "collect", arguments: { block: "oak_log", count: 10 } }], adapter: null, model: "gemma4:e4b" })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the flat {name, arguments} tool_calls shape without needing JSON.parse", async () => {
    const provider = new HaruChatProvider("https://chat.hosokawa-lab.dev", "secret", 5000);
    const result = await provider.chat({ system: "s", messages: [], tools: [] });

    expect(result.toolCalls).toEqual([{ name: "collect", args: { block: "oak_log", count: 10 } }]);
    expect(result.text).toBe("よし、木を集めてくるね。");
  });

  it("sends tools in OpenAI function format, temperature capped at 0.3, and autonomous:true by default", async () => {
    const provider = new HaruChatProvider("https://chat.hosokawa-lab.dev", "secret", 5000);
    await provider.chat({
      system: "s",
      messages: [],
      tools: [{ name: "wait", description: "待つ", parameters: { type: "object", properties: {} } }],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.tools).toEqual([
      { type: "function", function: { name: "wait", description: "待つ", parameters: { type: "object", properties: {} } } },
    ]);
    expect(body.temperature).toBe(0.3);
    expect(body.autonomous).toBe(true);
    expect(body.stream).toBe(false);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://chat.hosokawa-lab.dev/chat");
    expect(fetchMock.mock.calls[0]?.[1]?.headers.Authorization).toBe("Bearer secret");
  });

  it("omits autonomous when constructed with autonomous=false", async () => {
    const provider = new HaruChatProvider("https://chat.hosokawa-lab.dev", "", 5000, false);
    await provider.chat({ system: "s", messages: [], tools: [] });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.autonomous).toBeUndefined();
  });

  it("re-wraps an assistant's prior tool_calls into {function:{name,arguments}} for history", async () => {
    const provider = new HaruChatProvider("https://chat.hosokawa-lab.dev", "", 5000);
    await provider.chat({
      system: "s",
      messages: [
        { role: "assistant", content: "よし、木を集めてくるね。", toolCalls: [{ name: "collect", args: { block: "oak_log", count: 10 } }] },
      ],
      tools: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.messages[1]).toEqual({
      role: "assistant",
      content: "よし、木を集めてくるね。",
      tool_calls: [{ function: { name: "collect", arguments: { block: "oak_log", count: 10 } } }],
    });
  });

  it("sends tool-role messages with tool_name (not tool_call_id)", async () => {
    const provider = new HaruChatProvider("https://chat.hosokawa-lab.dev", "", 5000);
    await provider.chat({
      system: "s",
      messages: [{ role: "tool", toolName: "collect", content: "oak_logを10個集めた" }],
      tools: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.messages[1]).toEqual({ role: "tool", tool_name: "collect", content: "oak_logを10個集めた" });
  });

  it("surfaces the {detail} error body in the thrown error on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ detail: "role の種類が違う" }) });
    const provider = new HaruChatProvider("https://chat.hosokawa-lab.dev", "", 5000);

    await expect(provider.chat({ system: "s", messages: [], tools: [] })).rejects.toThrow(/422.*role の種類が違う/);
  });
});
