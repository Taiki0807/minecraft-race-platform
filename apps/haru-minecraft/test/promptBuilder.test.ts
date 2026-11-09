import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/brain/promptBuilder.js";
import type { GameState } from "../src/bot/state.js";
import type { ReflectionRule } from "../src/memory/types.js";

const state: GameState = {
  hp: 20,
  food: 18,
  position: { x: 1, y: 64, z: 2 },
  ground: "grass_block",
  timeOfDay: 1000,
  isDay: true,
  inventory: [],
  nearbyEntities: [],
};

describe("buildSystemPrompt", () => {
  it("includes the persona, current state, and active rules", () => {
    const rules: ReflectionRule[] = [
      { id: "r1", rule: "夜は拠点に戻る", active: true, createdAt: "", sourceEpisodeId: null },
    ];
    const prompt = buildSystemPrompt("ハルの人格プロンプト", state, rules);
    expect(prompt).toContain("ハルの人格プロンプト");
    expect(prompt).toContain("HP:20");
    expect(prompt).toContain("夜は拠点に戻る");
  });

  it("stays short (Shannon-lesson: no giant embedded prompt)", () => {
    const prompt = buildSystemPrompt("ハルの人格プロンプト", state, []);
    expect(prompt.length).toBeLessThan(1000);
    expect(prompt).toContain("(なし)");
  });

  it("includes learned-skill hints when provided", () => {
    const prompt = buildSystemPrompt("ハルの人格プロンプト", state, [], ["木を集めるときは斧を装備する"]);
    expect(prompt).toContain("木を集めるときは斧を装備する");
  });

  it("flags standing on tree leaves and suggests go_down", () => {
    const onTree: GameState = { ...state, ground: "oak_leaves" };
    const prompt = buildSystemPrompt("ハルの人格プロンプト", onTree, []);
    expect(prompt).toContain("足元: oak_leaves");
    expect(prompt).toContain("go_down");
  });

  it("flags nothing underfoot (likely falling)", () => {
    const falling: GameState = { ...state, ground: "air" };
    const prompt = buildSystemPrompt("ハルの人格プロンプト", falling, []);
    expect(prompt).toContain("足元: air");
    expect(prompt).toContain("落下中かも");
  });
});
