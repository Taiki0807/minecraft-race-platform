import type { Bot } from "mineflayer";
import { goals } from "../pathfinderGoals.js";
import { walkTo } from "../../bot/movement.js";
import { nearbyHostiles } from "../../bot/danger.js";
import type { Skill } from "../types.js";

const FLEE_DISTANCE = 16;

export const fleeSkill: Skill = {
  definition: {
    name: "flee",
    description: "周囲の敵から離れるように逃げる。引数は不要。",
    parameters: { type: "object", properties: {} },
  },
  timeoutMs: 60_000,
  handler: async (ctx) => {
    const bot = ctx.bot as Bot;
    const hostiles = nearbyHostiles(bot);
    if (hostiles.length === 0) return { ok: true, message: "近くに敵がいない" };

    const position = bot.entity.position;
    let awayX = 0;
    let awayZ = 0;
    for (const hostile of hostiles) {
      awayX += position.x - hostile.position.x;
      awayZ += position.z - hostile.position.z;
    }
    const length = Math.hypot(awayX, awayZ) || 1;
    const targetX = position.x + (awayX / length) * FLEE_DISTANCE;
    const targetZ = position.z + (awayZ / length) * FLEE_DISTANCE;

    const result = await walkTo(bot, new goals.GoalNear(targetX, position.y, targetZ, 2));
    const stillChased = nearbyHostiles(bot).length > 0;
    if (!result.ok) return { ok: false, message: `逃げようとしたが${result.message}` };
    return stillChased
      ? { ok: true, message: "距離を取ったが、まだ敵が近くにいる" }
      : { ok: true, message: "敵から逃げ切った" };
  },
};
