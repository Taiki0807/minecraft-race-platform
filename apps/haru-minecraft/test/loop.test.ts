import { describe, expect, it, vi } from "vitest";
import { runJudgmentCycle } from "../src/brain/loop.js";
import { SkillRegistry } from "../src/skills/registry.js";
import type { LLMProvider, LLMResponse } from "../src/brain/llmProvider.js";
import type { JsonlLogger } from "../src/logging/jsonl.js";
import type { EventEnvelopeInput } from "../src/bridge/types.js";

function fakeLlm(response: LLMResponse): LLMProvider {
  return { chat: vi.fn(async () => response) };
}

function fakeLogger(): JsonlLogger {
  return { log: vi.fn(async () => undefined) } as unknown as JsonlLogger;
}

describe("runJudgmentCycle", () => {
  it("routes a speak tool_call to the bridge instead of executing it as a skill", async () => {
    const registry = new SkillRegistry();
    const sendEvent = vi.fn(async (_input: EventEnvelopeInput) => undefined);

    const result = await runJudgmentCycle({
      llm: fakeLlm({ toolCalls: [{ name: "speak", args: { text: "うーん、次は石を掘るぞ" } }] }),
      registry,
      bot: null,
      system: "system prompt",
      history: [],
      bridge: { sendEvent },
      logger: fakeLogger(),
      sessionId: "s1",
    });

    expect(result.spoke).toEqual(["うーん、次は石を掘るぞ"]);
    expect(result.executed).toEqual([]);
    expect(sendEvent).toHaveBeenCalledWith({
      type: "say",
      payload: { text: "うーん、次は石を掘るぞ", kind: "intent" },
    });
  });

  it("executes a non-speak tool_call through the skill registry", async () => {
    const registry = new SkillRegistry();
    registry.register({
      definition: { name: "wait", description: "wait", parameters: { type: "object", properties: {} } },
      timeoutMs: 1000,
      handler: async () => ({ ok: true, message: "待機した" }),
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runJudgmentCycle({
      llm: fakeLlm({ toolCalls: [{ name: "wait", args: { seconds: 3 } }] }),
      registry,
      bot: null,
      system: "system prompt",
      history: [],
      bridge: { sendEvent },
      logger: fakeLogger(),
      sessionId: "s1",
    });

    expect(result.executed).toEqual([
      { name: "wait", args: { seconds: 3 }, result: { ok: true, message: "待機した" } },
    ]);
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("uses the provided speakKind override", async () => {
    const registry = new SkillRegistry();
    const sendEvent = vi.fn(async () => undefined);

    await runJudgmentCycle({
      llm: fakeLlm({ toolCalls: [{ name: "speak", args: { text: "危ない！" } }] }),
      registry,
      bot: null,
      system: "system prompt",
      history: [],
      bridge: { sendEvent },
      logger: fakeLogger(),
      sessionId: "s1",
      speakKind: "reflex",
    });

    expect(sendEvent).toHaveBeenCalledWith({ type: "say", payload: { text: "危ない！", kind: "reflex" } });
  });

  it("speaks response.text directly (2026-11-09 /chat contract: content is the spoken line, not a tool)", async () => {
    const registry = new SkillRegistry();
    const sendEvent = vi.fn(async () => undefined);

    const result = await runJudgmentCycle({
      llm: fakeLlm({ toolCalls: [], text: "よし、木を集めてくるね。" }),
      registry,
      bot: null,
      system: "system prompt",
      history: [],
      bridge: { sendEvent },
      logger: fakeLogger(),
      sessionId: "s1",
    });

    expect(result.spoke).toEqual(["よし、木を集めてくるね。"]);
    expect(sendEvent).toHaveBeenCalledWith({
      type: "say",
      payload: { text: "よし、木を集めてくるね。", kind: "intent" },
    });
  });

  it("speaks response.text AND executes tool_calls in the same cycle (native contract sends both together)", async () => {
    const registry = new SkillRegistry();
    registry.register({
      definition: { name: "collect", description: "collect", parameters: { type: "object", properties: {} } },
      timeoutMs: 1000,
      handler: async () => ({ ok: true, message: "oak_logを10個集めた" }),
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runJudgmentCycle({
      llm: fakeLlm({
        toolCalls: [{ name: "collect", args: { block: "oak_log", count: 10 } }],
        text: "よし、木を集めてくるね。",
      }),
      registry,
      bot: null,
      system: "system prompt",
      history: [],
      bridge: { sendEvent },
      logger: fakeLogger(),
      sessionId: "s1",
    });

    expect(result.spoke).toEqual(["よし、木を集めてくるね。"]);
    expect(result.executed).toEqual([
      { name: "collect", args: { block: "oak_log", count: 10 }, result: { ok: true, message: "oak_logを10個集めた" } },
    ]);
  });
});
