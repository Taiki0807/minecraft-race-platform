import { describe, expect, it, vi } from "vitest";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { attackSkill } from "../src/skills/definitions/attack.js";

function vec(x: number, y: number, z: number) {
  return {
    x,
    y,
    z,
    distanceTo(other: { x: number; y: number; z: number }) {
      return Math.sqrt((x - other.x) ** 2 + (y - other.y) ** 2 + (z - other.z) ** 2);
    },
  };
}

describe("attackSkill", () => {
  it("fails cleanly when the named target isn't nearby", async () => {
    const bot = {
      entity: { id: 1, position: new Vec3(0, 64, 0) },
      entities: { "1": { id: 1, position: vec(0, 64, 0) } },
      inventory: { items: () => [] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as Bot;

    const result = await attackSkill.handler({ bot }, { target: "zombie" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("見つからない");
  });

  it("equips the best weapon and attacks until the target disappears", async () => {
    let zombieAlive = true;
    const bot = {
      entity: { id: 1, position: new Vec3(0, 64, 0) },
      get entities() {
        return {
          "1": { id: 1, position: vec(0, 64, 0) },
          ...(zombieAlive ? { "2": { id: 2, name: "zombie", position: vec(1, 64, 0) } } : {}),
        };
      },
      inventory: { items: () => [{ name: "iron_sword", type: 99 }] },
      equip: vi.fn(async () => undefined),
      attack: vi.fn(() => {
        zombieAlive = false; // 1発で倒れる単純なテスト
      }),
      waitForTicks: vi.fn(async () => undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as Bot;

    const result = await attackSkill.handler({ bot }, { target: "zombie" });
    expect(bot.equip).toHaveBeenCalled();
    expect(bot.attack).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("倒した");
  });
});
