import { describe, expect, it, vi } from "vitest";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { fleeSkill } from "../src/skills/definitions/flee.js";

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

describe("fleeSkill", () => {
  it("does nothing and succeeds when no hostiles are nearby", async () => {
    const bot = {
      entity: { id: 1, position: new Vec3(0, 64, 0) },
      entities: { "1": { id: 1, position: vec(0, 64, 0) } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as Bot;

    const result = await fleeSkill.handler({ bot }, {});
    expect(result).toEqual({ ok: true, message: "近くに敵がいない" });
  });

  it("walks away from a nearby hostile and reports success once clear", async () => {
    const gotoCalls: Array<{ x: number; z: number }> = [];
    let fled = false;
    const bot = {
      entity: { id: 1, position: new Vec3(0, 64, 0), yaw: 0 },
      get entities() {
        return {
          "1": { id: 1, position: vec(0, 64, 0) },
          ...(fled ? {} : { "2": { id: 2, name: "zombie", kind: "Hostile mobs", position: vec(2, 64, 0) } }),
        };
      },
      blockAt: () => null,
      canDigBlock: () => false,
      dig: vi.fn(async () => undefined),
      setControlState: vi.fn(),
      clearControlStates: vi.fn(),
      waitForTicks: vi.fn(async () => undefined),
      pathfinder: {
        goto: vi.fn(async (goal: { x: number; z: number }) => {
          gotoCalls.push({ x: goal.x, z: goal.z });
          fled = true;
        }),
        stop: vi.fn(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as Bot;

    const result = await fleeSkill.handler({ bot }, {});
    expect(gotoCalls).toHaveLength(1);
    expect(gotoCalls[0]?.x).toBeLessThan(0); // 敵(+x方向)から離れ、-x方向へ逃げる
    expect(result).toEqual({ ok: true, message: "敵から逃げ切った" });
  });
});
