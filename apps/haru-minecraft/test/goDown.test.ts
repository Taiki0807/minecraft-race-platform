import { describe, expect, it, vi } from "vitest";
import type { Bot } from "mineflayer";
import { goDownSkill } from "../src/skills/definitions/goDown.js";

type ColumnWorld = Record<number, { name: string; boundingBox: "block" | "empty" }>;

function block(name: string): { name: string; boundingBox: "block" | "empty" } {
  return { name, boundingBox: "block" };
}
function empty(): { name: string; boundingBox: "block" | "empty" } {
  return { name: "air", boundingBox: "empty" };
}

/** y座標 -> ブロック情報 の対応表だけを持つ、1本の列(x,z固定)のフェイクワールド。 */
function fakeBotOnColumn(position: { x: number; y: number; z: number }, column: ColumnWorld) {
  const gotoCalls: Array<{ x: number; y: number; z: number }> = [];
  const bot = {
    entity: { position },
    blockAt: (vec: { y: number }) => column[vec.y] ?? null,
    pathfinder: {
      goto: vi.fn(async (goal: { x: number; y: number; z: number }) => {
        gotoCalls.push({ x: goal.x, y: goal.y, z: goal.z });
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Bot;
  return { bot, gotoCalls };
}

describe("goDownSkill", () => {
  it("walks to the real ground below when standing on top of tree leaves", async () => {
    // y=70に立っている。足元(y=69)は葉っぱ。本当の地面はy=63(block)+y=64(empty)。
    const column: ColumnWorld = {
      69: block("oak_leaves"),
      68: empty(),
      67: empty(),
      66: empty(),
      65: empty(),
      64: empty(),
      63: block("grass_block"),
    };

    const { bot, gotoCalls } = fakeBotOnColumn({ x: 5, y: 70, z: 5 }, column);
    const result = await goDownSkill.handler({ bot }, {});

    expect(result.ok).toBe(true);
    expect(result.message).toContain("y=64");
    expect(gotoCalls).toEqual([{ x: 5, y: 64, z: 5 }]);
  });

  it("does nothing when already standing on non-tree ground", async () => {
    const column: ColumnWorld = { 63: block("grass_block") };
    const { bot, gotoCalls } = fakeBotOnColumn({ x: 0, y: 64, z: 0 }, column);

    const result = await goDownSkill.handler({ bot }, {});

    expect(result).toEqual({ ok: true, message: "すでに地面にいる" });
    expect(gotoCalls).toEqual([]);
  });

  it("skips through an oak_log trunk too, not just leaves", async () => {
    const column: ColumnWorld = {
      69: block("oak_leaves"),
      68: block("oak_log"),
      67: block("oak_log"),
      66: empty(),
      65: block("dirt"),
    };
    const { bot, gotoCalls } = fakeBotOnColumn({ x: 0, y: 70, z: 0 }, column);

    const result = await goDownSkill.handler({ bot }, {});

    expect(result.ok).toBe(true);
    expect(gotoCalls).toEqual([{ x: 0, y: 66, z: 0 }]);
  });

  it("fails cleanly when the block underfoot hasn't loaded", async () => {
    const { bot, gotoCalls } = fakeBotOnColumn({ x: 0, y: 64, z: 0 }, {});

    const result = await goDownSkill.handler({ bot }, {});

    expect(result).toEqual({ ok: false, message: "足元の状況が分からない(未読み込み域)" });
    expect(gotoCalls).toEqual([]);
  });

  it("fails when standing on tree material but no real ground is found within the scan range", async () => {
    const column: ColumnWorld = { 69: block("oak_leaves") };
    const { bot, gotoCalls } = fakeBotOnColumn({ x: 0, y: 70, z: 0 }, column);

    const result = await goDownSkill.handler({ bot }, {});

    expect(result.ok).toBe(false);
    expect(result.message).toContain("地面が見つからない");
    expect(gotoCalls).toEqual([]);
  });
});
