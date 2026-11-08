import { describe, expect, it } from "vitest";
import { createSkillRegistry } from "../src/skills/index.js";

describe("createSkillRegistry", () => {
  it("registers every skill from spec (C)", () => {
    const registry = createSkillRegistry();
    const names = registry.listToolDefinitions().map((d) => d.name).sort();
    expect(names).toEqual(
      [
        "collect",
        "craft_item",
        "deposit_to_chest",
        "dig_block",
        "eat",
        "equip",
        "find_blocks",
        "get_state",
        "move_to",
        "place_block",
        "speak",
        "wait",
        "withdraw_from_chest",
      ].sort()
    );
  });

  it("gives every tool a non-empty description", () => {
    const registry = createSkillRegistry();
    for (const def of registry.listToolDefinitions()) {
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});
