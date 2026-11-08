import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { mcDataFor } from "../mcDataFor.js";
import type { Skill } from "../types.js";

export const placeBlockSkill: Skill = {
  definition: {
    name: "place_block",
    description: "指定座標にブロックを置く(足元にある基準ブロックの上に設置する)。",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "設置するアイテム名(インベントリ内)" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      required: ["item", "x", "y", "z"],
    },
  },
  timeoutMs: 15_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const itemName = typeof args.item === "string" ? args.item : "";
    const x = Number(args.x);
    const y = Number(args.y);
    const z = Number(args.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return { ok: false, message: "x,y,z は数値で指定してください" };
    }

    const data = mcDataFor(bot);
    const itemInfo = data.itemsByName[itemName];
    if (!itemInfo) return { ok: false, message: `未知のアイテム名: ${itemName}` };

    const held = bot.inventory.items().find((item) => item.type === itemInfo.id);
    if (!held) return { ok: false, message: `${itemName} を持っていない` };

    const referenceBlock = bot.blockAt(new Vec3(x, y - 1, z));
    if (!referenceBlock) return { ok: false, message: "設置先の基準ブロックが見つからない(未読み込み域)" };

    try {
      await bot.equip(held, "hand");
      await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      return { ok: true, message: `(${x}, ${y}, ${z}) に ${itemName} を設置した` };
    } catch (error) {
      return {
        ok: false,
        message: `設置に失敗した: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
