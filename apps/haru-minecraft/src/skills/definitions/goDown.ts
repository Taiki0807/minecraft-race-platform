import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { goals } from "../pathfinderGoals.js";
import type { Skill } from "../types.js";

const MAX_SCAN_DOWN = 60;

// 葉っぱ・原木など「木の上に乗ってしまった」を示すブロック。boundingBoxだけでは
// 普通の地面(stone/dirt等も"block")と区別できないため、名前で判定する。
function isTreeMaterial(name: string): boolean {
  return name.includes("leaves") || name.endsWith("_log") || name.endsWith("_wood");
}

/**
 * 木の上(葉っぱ・原木)に乗ってしまったときに、木材を飛ばして本当の地面まで降りる。
 * 既に木材でない場所に立っているなら何もしない。
 */
export const goDownSkill: Skill = {
  definition: {
    name: "go_down",
    description: "木の上や高い場所にいるとき、地面まで降りる。",
    parameters: { type: "object", properties: {} },
  },
  timeoutMs: 30_000,
  handler: async (ctx) => {
    const bot = ctx.bot as Bot;
    const position = bot.entity.position;
    const x = Math.floor(position.x);
    const z = Math.floor(position.z);
    const standingY = Math.floor(position.y) - 1;

    const standing = bot.blockAt(new Vec3(x, standingY, z));
    if (!standing) {
      return { ok: false, message: "足元の状況が分からない(未読み込み域)" };
    }
    if (!isTreeMaterial(standing.name)) {
      return { ok: true, message: "すでに地面にいる" };
    }

    const minY = standingY - MAX_SCAN_DOWN;
    let groundY: number | null = null;
    for (let y = standingY - 1; y >= minY; y--) {
      const below = bot.blockAt(new Vec3(x, y, z));
      const at = bot.blockAt(new Vec3(x, y + 1, z));
      if (
        below &&
        at &&
        below.boundingBox === "block" &&
        !isTreeMaterial(below.name) &&
        at.boundingBox === "empty"
      ) {
        groundY = y + 1;
        break;
      }
    }

    if (groundY === null) {
      return { ok: false, message: "地面が見つからない(走査範囲内に木材でない場所が無い)" };
    }

    try {
      await bot.pathfinder.goto(new goals.GoalNear(x, groundY, z, 1));
      return { ok: true, message: `地面(y=${groundY})まで降りた` };
    } catch (error) {
      return {
        ok: false,
        message: `降りるのに失敗した: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
