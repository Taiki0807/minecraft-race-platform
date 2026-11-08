import type { Bot } from "mineflayer";
import { mcDataFor } from "../mcDataFor.js";
import type { Skill } from "../types.js";

export const equipSkill: Skill = {
  definition: {
    name: "equip",
    description: "インベントリ内のアイテムを手に持つ。",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "手に持つアイテム名" },
      },
      required: ["item"],
    },
  },
  timeoutMs: 5_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const itemName = typeof args.item === "string" ? args.item : "";

    const data = mcDataFor(bot);
    const itemInfo = data.itemsByName[itemName];
    if (!itemInfo) return { ok: false, message: `未知のアイテム名: ${itemName}` };

    const held = bot.inventory.items().find((item) => item.type === itemInfo.id);
    if (!held) return { ok: false, message: `${itemName} を持っていない` };

    try {
      await bot.equip(held, "hand");
      return { ok: true, message: `${itemName} を装備した` };
    } catch (error) {
      return {
        ok: false,
        message: `装備に失敗した: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
