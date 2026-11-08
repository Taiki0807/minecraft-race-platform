import type { Bot } from "mineflayer";
import type { Skill } from "../types.js";

// bot.inventory の中から「食べられそうな」名前を探すための簡易リスト。
// mineflayer-auto-eat 相当の判定ロジックを持たないための代用。
const FOOD_NAMES = [
  "bread",
  "apple",
  "baked_potato",
  "cooked_beef",
  "cooked_porkchop",
  "cooked_chicken",
  "cooked_mutton",
  "cooked_rabbit",
  "cooked_salmon",
  "cooked_cod",
  "carrot",
  "melon_slice",
  "golden_apple",
  "golden_carrot",
];

export const eatSkill: Skill = {
  definition: {
    name: "eat",
    description: "インベントリにある食べ物を食べて満腹度を回復する。",
    parameters: { type: "object", properties: {} },
  },
  timeoutMs: 10_000,
  handler: async (ctx) => {
    const bot = ctx.bot as Bot;
    const food = bot.inventory.items().find((item) => FOOD_NAMES.includes(item.name));
    if (!food) return { ok: false, message: "食べ物を持っていない" };

    try {
      await bot.equip(food, "hand");
      await bot.consume();
      return { ok: true, message: `${food.name} を食べた` };
    } catch (error) {
      return {
        ok: false,
        message: `食事に失敗した: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
