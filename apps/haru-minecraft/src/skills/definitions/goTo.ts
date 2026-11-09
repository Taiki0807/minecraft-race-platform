import type { Bot } from "mineflayer";
import { goals } from "../pathfinderGoals.js";
import type { Skill } from "../types.js";

export const goToSkill: Skill = {
  definition: {
    name: "go_to",
    description: "指定座標の近く(1マス以内)まで歩いて移動する。",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      required: ["x", "y", "z"],
    },
  },
  timeoutMs: 30_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const x = Number(args.x);
    const y = Number(args.y);
    const z = Number(args.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return { ok: false, message: "x,y,z は数値で指定してください" };
    }

    try {
      await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1));
      return { ok: true, message: `(${x}, ${y}, ${z}) 付近に到達した` };
    } catch (error) {
      return { ok: false, message: `移動に失敗した: ${error instanceof Error ? error.message : String(error)}` };
    }
  },
};
