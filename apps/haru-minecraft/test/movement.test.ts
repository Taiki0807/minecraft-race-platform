import { describe, expect, it, vi } from "vitest";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { walkTo } from "../src/bot/movement.js";

function fakeBot(gotoImpl: () => Promise<void>) {
  const calls = { dig: 0, setControlState: 0, clearControlStates: 0, waitForTicks: 0, stop: 0 };
  const bot = {
    entity: { position: new Vec3(0, 64, 0), yaw: 0 },
    blockAt: () => null, // 正面に木材なし(単純なケース): digは呼ばれない
    canDigBlock: () => false,
    dig: vi.fn(async () => {
      calls.dig += 1;
    }),
    setControlState: vi.fn(() => {
      calls.setControlState += 1;
    }),
    clearControlStates: vi.fn(() => {
      calls.clearControlStates += 1;
    }),
    waitForTicks: vi.fn(async () => {
      calls.waitForTicks += 1;
    }),
    pathfinder: {
      goto: vi.fn(gotoImpl),
      stop: vi.fn(() => {
        calls.stop += 1;
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Bot;
  return { bot, calls };
}

describe("walkTo", () => {
  it("returns ok immediately when goto succeeds on the first try", async () => {
    const { bot, calls } = fakeBot(async () => undefined);
    const result = await walkTo(bot, { x: 1, y: 64, z: 1 } as never);
    expect(result).toEqual({ ok: true, message: "移動完了" });
    expect(calls.setControlState).toBe(0); // unstuckは一度も呼ばれない
  });

  it("retries via unstuck() after a stuck goto, then succeeds", async () => {
    let attempt = 0;
    const { bot, calls } = fakeBot(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("stuck");
    });
    const result = await walkTo(bot, { x: 1, y: 64, z: 1 } as never);
    expect(result).toEqual({ ok: true, message: "移動完了" });
    expect(attempt).toBe(2);
    expect(calls.setControlState).toBeGreaterThan(0); // unstuckが1回実行された
    expect(calls.clearControlStates).toBeGreaterThan(0);
  });

  it("gives up after 3 failed attempts with a specific Japanese message", async () => {
    const { bot } = fakeBot(async () => {
      throw new Error("stuck");
    });
    const result = await walkTo(bot, { x: 1, y: 64, z: 1 } as never);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("木にぶつかって進めない");
    expect(bot.pathfinder.goto).toHaveBeenCalledTimes(3);
  });

  it("digs blocking tree material directly in front during unstuck", async () => {
    let attempt = 0;
    const frontBlock = { name: "oak_log" };
    const bot = {
      entity: { position: new Vec3(0, 64, 0), yaw: 0 },
      blockAt: () => frontBlock,
      canDigBlock: () => true,
      dig: vi.fn(async () => undefined),
      setControlState: vi.fn(),
      clearControlStates: vi.fn(),
      waitForTicks: vi.fn(async () => undefined),
      pathfinder: {
        goto: vi.fn(async () => {
          attempt += 1;
          if (attempt === 1) throw new Error("stuck");
        }),
        stop: vi.fn(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as Bot;

    const result = await walkTo(bot, { x: 1, y: 64, z: 1 } as never);
    expect(result.ok).toBe(true);
    expect(bot.dig).toHaveBeenCalled();
  });
});
