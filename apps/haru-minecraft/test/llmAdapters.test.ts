import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider, parseOpenAiResponse } from "../src/brain/adapters/ollama.js";
import { parseHomeLlmContent } from "../src/brain/adapters/homeLlm.js";

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

  it("ignores tool_calls entries missing a string name", () => {
    const result = parseHomeLlmContent('{"tool_calls":[{"args":{}},{"name":"eat","args":{}}]}');
    expect(result.toolCalls).toEqual([{ name: "eat", args: {} }]);
  });
});
