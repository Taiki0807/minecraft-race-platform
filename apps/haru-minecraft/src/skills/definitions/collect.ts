import type { Bot } from "mineflayer";
import { goals } from "../pathfinderGoals.js";
import { mcDataFor } from "../mcDataFor.js";
import type { Skill } from "../types.js";

const SEARCH_RANGE = 48;

export const collectSkill: Skill = {
  definition: {
    name: "collect",
    description: "周囲から指定アイテムのブロックを探して繰り返し採集する。",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "採集するブロック/アイテム名" },
        count: { type: "number", description: "目標個数" },
      },
      required: ["item", "count"],
    },
  },
  timeoutMs: 120_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const itemName = typeof args.item === "string" ? args.item : "";
    const targetCount = typeof args.count === "number" && args.count > 0 ? Math.floor(args.count) : 1;

    const data = mcDataFor(bot);
    const blockInfo = data.blocksByName[itemName];
    if (!blockInfo) {
      return { ok: false, message: `未知のブロック/アイテム名: ${itemName}` };
    }

    let collected = 0;
    try {
      while (collected < targetCount) {
        const block = bot.findBlock({ matching: blockInfo.id, maxDistance: SEARCH_RANGE });
        if (!block) break;

        await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1));
        if (!bot.canDigBlock(block)) break;

        const tool = bot.pathfinder.bestHarvestTool(block);
        if (tool) await bot.equip(tool, "hand");

        await bot.dig(block);
        collected += 1;
      }
    } catch (error) {
      return {
        ok: collected > 0,
        message:
          collected > 0
            ? `${collected}/${targetCount} 個採集した後に中断した`
            : `採集に失敗した: ${error instanceof Error ? error.message : String(error)}`,
        data: { collected },
      };
    }

    if (collected === 0) {
      return { ok: false, message: `周囲に${itemName}が見つからない`, data: { collected } };
    }
    if (collected < targetCount) {
      return {
        ok: false,
        message: `${itemName}を${collected}/${targetCount}個しか採集できなかった(周囲に残っていない)`,
        data: { collected },
      };
    }
    return { ok: true, message: `${itemName}を${collected}個採集した`, data: { collected } };
  },
};
