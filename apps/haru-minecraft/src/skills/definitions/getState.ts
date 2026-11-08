import type { Bot } from "mineflayer";
import { buildState } from "../../bot/state.js";
import type { Skill } from "../types.js";

export const getStateSkill: Skill = {
  definition: {
    name: "get_state",
    description: "現在のHP・満腹度・座標・インベントリ・周囲の状況を取得する。",
    parameters: { type: "object", properties: {} },
  },
  timeoutMs: 2_000,
  handler: async (ctx) => {
    const bot = ctx.bot as Bot;
    const state = buildState(bot);
    return { ok: true, message: "状態を取得した", data: state as unknown as Record<string, unknown> };
  },
};
