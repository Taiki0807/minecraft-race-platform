import type { Bot } from "mineflayer";
import { mcDataFor } from "../mcDataFor.js";
import type { Skill } from "../types.js";

const DEFAULT_RANGE = 32;

export const findBlocksSkill: Skill = {
  definition: {
    name: "find_blocks",
    description: "周囲から指定した種類のブロックを探し、座標の一覧を返す。",
    parameters: {
      type: "object",
      properties: {
        block: { type: "string", description: "ブロック名(例: iron_ore)" },
        range: { type: "number", description: "探索半径(省略時32)" },
      },
      required: ["block"],
    },
  },
  timeoutMs: 5_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const blockName = typeof args.block === "string" ? args.block : "";
    const range = typeof args.range === "number" ? args.range : DEFAULT_RANGE;

    const data = mcDataFor(bot);
    const blockInfo = data.blocksByName[blockName];
    if (!blockInfo) {
      return { ok: false, message: `未知のブロック名: ${blockName}` };
    }

    const positions = bot.findBlocks({ matching: blockInfo.id, maxDistance: range, count: 20 });
    if (positions.length === 0) {
      return { ok: false, message: `周囲${range}ブロック以内に${blockName}が見つからない` };
    }

    return {
      ok: true,
      message: `${positions.length}件の${blockName}を見つけた`,
      data: { positions: positions.map((p) => ({ x: p.x, y: p.y, z: p.z })) },
    };
  },
};
