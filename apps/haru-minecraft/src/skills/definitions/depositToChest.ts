import type { Bot, Chest } from "mineflayer";
import { goals } from "../pathfinderGoals.js";
import { mcDataFor } from "../mcDataFor.js";
import { walkTo } from "../../bot/movement.js";
import type { Skill } from "../types.js";

const CHEST_RANGE = 32;

type DepositEntry = { item: string; count: number };

async function openNearestChest(bot: Bot): Promise<Chest | { error: string } | null> {
  const data = mcDataFor(bot);
  const chestId = data.blocksByName.chest?.id;
  if (chestId === undefined) return null;
  const block = bot.findBlock({ matching: chestId, maxDistance: CHEST_RANGE });
  if (!block) return null;

  const moveResult = await walkTo(bot, new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1));
  if (!moveResult.ok) return { error: moveResult.message };
  return (await bot.openContainer(block)) as Chest;
}

export const depositToChestSkill: Skill = {
  definition: {
    name: "deposit_to_chest",
    description: "近くのチェストにアイテムを預ける。itemsを省略すると持ち物全てを預ける。",
    parameters: {
      type: "object",
      properties: {
        items: {
          description: "\"all\" または [{item, count}] の配列",
        },
      },
    },
  },
  timeoutMs: 20_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const chest = await openNearestChest(bot);
    if (!chest) return { ok: false, message: "周囲にチェストが見つからない" };
    if ("error" in chest) return { ok: false, message: chest.error };

    try {
      const data = mcDataFor(bot);
      const spec = args.items;

      if (spec === undefined || spec === "all") {
        for (const item of bot.inventory.items()) {
          await chest.deposit(item.type, null, item.count);
        }
      } else if (Array.isArray(spec)) {
        for (const entry of spec as DepositEntry[]) {
          const info = data.itemsByName[entry.item];
          if (!info) continue;
          await chest.deposit(info.id, null, entry.count);
        }
      }
      return { ok: true, message: "チェストに預けた" };
    } catch (error) {
      return {
        ok: false,
        message: `預け入れに失敗した: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      await chest.close();
    }
  },
};
