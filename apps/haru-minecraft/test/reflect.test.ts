import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../src/memory/db.js";
import { recordEpisode, startSession } from "../src/memory/repository.js";
import {
  buildReflectionRequest,
  classifyToolEpisode,
  extractRuleText,
  formatSkillHints,
  runReflectionPass,
  skillKeyFor,
} from "../src/memory/reflect.js";
import type { LLMProvider } from "../src/brain/llmProvider.js";
import type { Episode } from "../src/memory/types.js";

describe("classifyToolEpisode", () => {
  it("classifies a failure as stuck", () => {
    const result = classifyToolEpisode("dig_block", { block: "iron_ore" }, { ok: false, message: "届かない" });
    expect(result).toEqual({ kind: "stuck", summary: "dig_block(block=iron_ore) に失敗: 届かない" });
  });

  it("classifies a notable success as achievement", () => {
    const result = classifyToolEpisode("collect", { item: "oak_log", count: 5 }, { ok: true, message: "5個採集した" });
    expect(result?.kind).toBe("achievement");
  });

  it("classifies find_blocks success as discovery", () => {
    const result = classifyToolEpisode("find_blocks", { block: "diamond_ore" }, { ok: true, message: "見つけた" });
    expect(result?.kind).toBe("discovery");
  });

  it("does not record non-notable successes", () => {
    expect(classifyToolEpisode("wait", { seconds: 1 }, { ok: true, message: "待機した" })).toBeNull();
  });
});

describe("skillKeyFor", () => {
  it("keys by tool + item", () => {
    expect(skillKeyFor("collect", { item: "oak_log" })).toBe("collect:oak_log");
  });

  it("keys by tool + block when item is absent", () => {
    expect(skillKeyFor("dig_block", { block: "stone" })).toBe("dig_block:stone");
  });

  it("falls back to the tool name alone", () => {
    expect(skillKeyFor("wait", { seconds: 1 })).toBe("wait");
  });
});

describe("formatSkillHints", () => {
  it("prefers the description, falling back to the name, and drops zero-similarity results", () => {
    const hints = formatSkillHints([
      { skill: { id: "1", name: "collect:oak_log", description: "木を集める", steps: [], embedding: [], successCount: 1, createdAt: "" }, similarity: 0.9 },
      { skill: { id: "2", name: "dig_block:stone", description: null, steps: [], embedding: [], successCount: 1, createdAt: "" }, similarity: 0.5 },
      { skill: { id: "3", name: "irrelevant", description: "無関係", steps: [], embedding: [], successCount: 1, createdAt: "" }, similarity: 0 },
    ]);
    expect(hints).toEqual(["木を集める", "dig_block:stone"]);
  });
});

describe("buildReflectionRequest / extractRuleText", () => {
  const episodes: Episode[] = [
    { id: "e1", sessionId: "s1", ts: "", kind: "death", summary: "溶岩に落ちた" },
    { id: "e2", sessionId: "s1", ts: "", kind: "achievement", summary: "鉄を採集した" },
    { id: "e3", sessionId: "s1", ts: "", kind: "stuck", summary: "dig_block に4回失敗" },
  ];

  it("includes only death/stuck episodes, ignoring achievements", () => {
    const request = buildReflectionRequest(episodes);
    expect(request?.targets.map((e) => e.id)).toEqual(["e1", "e3"]);
    expect(request?.messages[0]?.content).toContain("溶岩に落ちた");
    expect(request?.messages[0]?.content).not.toContain("鉄を採集した");
  });

  it("returns null when there is nothing to reflect on", () => {
    expect(buildReflectionRequest([episodes[1]!])).toBeNull();
  });

  it("extracts only the first line of the model's response", () => {
    expect(extractRuleText("夜は拠点に戻る\n(補足: 理由...)")).toBe("夜は拠点に戻る");
  });

  it("returns null for an empty response", () => {
    expect(extractRuleText("   ")).toBeNull();
    expect(extractRuleText(undefined)).toBeNull();
  });
});

describe("runReflectionPass", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  function fakeLlm(text: string): LLMProvider {
    return { chat: vi.fn(async () => ({ toolCalls: [], text })) };
  }

  it("saves a reflection rule derived from stuck/death episodes", async () => {
    const sessionId = startSession(db);
    recordEpisode(db, { sessionId, kind: "death", summary: "溶岩に落ちた" });

    const rule = await runReflectionPass(fakeLlm("溶岩の近くでは足元を確認する"), db, sessionId);

    expect(rule).toBe("溶岩の近くでは足元を確認する");
    const row = db.prepare("SELECT rule FROM reflection_rules WHERE active = 1").get() as { rule: string };
    expect(row.rule).toBe("溶岩の近くでは足元を確認する");
  });

  it("does nothing when the session had no stuck/death episodes", async () => {
    const sessionId = startSession(db);
    recordEpisode(db, { sessionId, kind: "achievement", summary: "鉄を採集した" });

    const rule = await runReflectionPass(fakeLlm("無視されるはず"), db, sessionId);

    expect(rule).toBeNull();
    const count = db.prepare("SELECT COUNT(*) as c FROM reflection_rules").get() as { c: number };
    expect(count.c).toBe(0);
  });
});
