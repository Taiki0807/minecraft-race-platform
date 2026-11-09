import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { goals } from "../pathfinderGoals.js";
import { walkTo } from "../../bot/movement.js";
import { findRealGroundY, isTreeMaterial } from "../../bot/ground.js";
import type { Skill } from "../types.js";

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
  timeoutMs: 200_000,
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

    const groundY = findRealGroundY(bot, x, z, standingY);
    if (groundY === null) {
      return { ok: false, message: "地面が見つからない(走査範囲内に木材でない場所が無い)" };
    }

    const result = await walkTo(bot, new goals.GoalNear(x, groundY, z, 1));
    return result.ok ? { ok: true, message: `地面(y=${groundY})まで降りた` } : result;
  },
};
