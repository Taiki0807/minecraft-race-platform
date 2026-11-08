import type { Bot, Chest } from "mineflayer";
import { goals } from "../pathfinderGoals.js";
import { mcDataFor } from "../mcDataFor.js";
import type { Skill } from "../types.js";

const CHEST_RANGE = 32;

async function openNearestChest(bot: Bot): Promise<Chest | null> {
  const data = mcDataFor(bot);
  const chestId = data.blocksByName.chest?.id;
  if (chestId === undefined) return null;
  const block = bot.findBlock({ matching: chestId, maxDistance: CHEST_RANGE });
  if (!block) return null;

  await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1));
  return (await bot.openContainer(block)) as Chest;
}

export const withdrawFromChestSkill: Skill = {
  definition: {
    name: "withdraw_from_chest",
    description: "近くのチェストから指定アイテムを取り出す。",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string" },
        count: { type: "number" },
      },
      required: ["item", "count"],
    },
  },
  timeoutMs: 20_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const itemName = typeof args.item === "string" ? args.item : "";
    const count = typeof args.count === "number" && args.count > 0 ? Math.floor(args.count) : 1;

    const data = mcDataFor(bot);
    const info = data.itemsByName[itemName];
    if (!info) return { ok: false, message: `未知のアイテム名: ${itemName}` };

    const chest = await openNearestChest(bot);
    if (!chest) return { ok: false, message: "周囲にチェストが見つからない" };

    try {
      const available = chest.containerItems().filter((item) => item.type === info.id);
      const totalAvailable = available.reduce((sum, item) => sum + item.count, 0);
      if (totalAvailable === 0) {
        return { ok: false, message: `チェストに${itemName}が入っていない` };
      }

      const toWithdraw = Math.min(count, totalAvailable);
      await chest.withdraw(info.id, null, toWithdraw);
      if (toWithdraw < count) {
        return {
          ok: false,
          message: `${itemName}は${toWithdraw}個しかチェストになかった(要求${count}個)`,
          data: { withdrawn: toWithdraw },
        };
      }
      return { ok: true, message: `${itemName}を${toWithdraw}個取り出した`, data: { withdrawn: toWithdraw } };
    } catch (error) {
      return {
        ok: false,
        message: `取り出しに失敗した: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      await chest.close();
    }
  },
};
