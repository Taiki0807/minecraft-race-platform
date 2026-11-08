import type { Bot } from "mineflayer";
import { goals } from "../pathfinderGoals.js";
import { mcDataFor } from "../mcDataFor.js";
import type { Skill } from "../types.js";

const CRAFTING_TABLE_RANGE = 32;

export const craftItemSkill: Skill = {
  definition: {
    name: "craft_item",
    description: "指定アイテムをクラフトする。手持ちで作れなければ近くの作業台を使う。",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "作るアイテム名" },
        count: { type: "number", description: "作る回数(省略時1)" },
      },
      required: ["item"],
    },
  },
  timeoutMs: 30_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const itemName = typeof args.item === "string" ? args.item : "";
    const count = typeof args.count === "number" && args.count > 0 ? Math.floor(args.count) : 1;

    const data = mcDataFor(bot);
    const itemInfo = data.itemsByName[itemName];
    if (!itemInfo) return { ok: false, message: `未知のアイテム名: ${itemName}` };

    let recipes = bot.recipesFor(itemInfo.id, null, 1, null);
    let craftingTable = undefined as Parameters<Bot["craft"]>[2];

    const craftingTableId = data.blocksByName.crafting_table?.id;
    if (recipes.length === 0 && craftingTableId !== undefined) {
      const tableBlock = bot.findBlock({
        matching: craftingTableId,
        maxDistance: CRAFTING_TABLE_RANGE,
      });
      if (tableBlock) {
        try {
          await bot.pathfinder.goto(
            new goals.GoalNear(tableBlock.position.x, tableBlock.position.y, tableBlock.position.z, 1)
          );
          recipes = bot.recipesFor(itemInfo.id, null, 1, tableBlock);
          craftingTable = tableBlock;
        } catch {
          // 作業台へ移動できなければ手持ちレシピのみで判断する(recipesは空のまま)。
        }
      }
    }

    if (recipes.length === 0) {
      return { ok: false, message: `${itemName}のレシピが満たせない(材料不足、または作業台が必要)` };
    }

    try {
      const recipe = recipes[0];
      if (!recipe) return { ok: false, message: `${itemName}のレシピが見つからない` };
      await bot.craft(recipe, count, craftingTable);
      return { ok: true, message: `${itemName}を${count}回クラフトした` };
    } catch (error) {
      return {
        ok: false,
        message: `クラフトに失敗した: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
