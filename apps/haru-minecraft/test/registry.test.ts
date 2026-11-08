import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../src/skills/registry.js";
import type { Skill } from "../src/skills/types.js";

function makeSkill(name: string, timeoutMs: number, handler: Skill["handler"]): Skill {
  return {
    definition: { name, description: "test", parameters: { type: "object", properties: {} } },
    timeoutMs,
    handler,
  };
}

describe("SkillRegistry", () => {
  it("executes a registered skill and returns its result", async () => {
    const registry = new SkillRegistry();
    registry.register(
      makeSkill("wait", 1000, async () => ({ ok: true, message: "待機した" }))
    );

    const result = await registry.execute("wait", { bot: null }, {});
    expect(result).toEqual({ ok: true, message: "待機した" });
  });

  it("returns an error result for an unknown tool name", async () => {
    const registry = new SkillRegistry();
    const result = await registry.execute("does_not_exist", { bot: null }, {});
    expect(result.ok).toBe(false);
    expect(result.message).toContain("does_not_exist");
  });

  it("returns a timeout result when the handler exceeds timeoutMs", async () => {
    const registry = new SkillRegistry();
    registry.register(
      makeSkill("slow", 10, () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, message: "done" }), 1000)))
    );

    const result = await registry.execute("slow", { bot: null }, {});
    expect(result).toEqual({ ok: false, message: "timeout" });
  });

  it("lists tool definitions for every registered skill", () => {
    const registry = new SkillRegistry();
    registry.register(makeSkill("a", 100, async () => ({ ok: true, message: "" })));
    registry.register(makeSkill("b", 100, async () => ({ ok: true, message: "" })));

    const names = registry.listToolDefinitions().map((d) => d.name);
    expect(names.sort()).toEqual(["a", "b"]);
  });
});
