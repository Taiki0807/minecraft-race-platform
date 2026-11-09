import type { Bot } from "mineflayer";
import { goals } from "../pathfinderGoals.js";
import { Vec3 } from "vec3";
import { mcDataFor } from "../mcDataFor.js";
import { walkTo } from "../../bot/movement.js";
import type { Skill } from "../types.js";

const DEFAULT_RANGE = 32;

async function digOne(bot: Bot, targetBlockId: number | null, x?: number, y?: number, z?: number) {
  const block =
    x !== undefined && y !== undefined && z !== undefined
      ? bot.blockAt(new Vec3(x, y, z))
      : targetBlockId !== null
        ? bot.findBlock({ matching: targetBlockId, maxDistance: DEFAULT_RANGE })
        : null;

  if (!block) return { ok: false as const, message: "対象のブロックが見つからない" };
  if (!bot.canDigBlock(block)) return { ok: false as const, message: `${block.name} は掘れない状態` };

  const moveResult = await walkTo(bot, new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1));
  if (!moveResult.ok) return { ok: false as const, message: moveResult.message };

  const tool = bot.pathfinder.bestHarvestTool(block);
  if (tool) {
    await bot.equip(tool, "hand");
  }

  await bot.dig(block);
  return { ok: true as const, message: `${block.name} を掘った`, blockName: block.name };
}

export const digBlockSkill: Skill = {
  definition: {
    name: "dig_block",
    description: "指定座標、または周囲で最も近い指定ブロックを掘る。countで複数回掘れる。",
    parameters: {
      type: "object",
      properties: {
        block: { type: "string", description: "ブロック名(x,y,z省略時はこれで探す)" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
        count: { type: "number", description: "掘る回数(省略時1)" },
      },
    },
  },
  timeoutMs: 60_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const blockName = typeof args.block === "string" ? args.block : undefined;
    const x = typeof args.x === "number" ? args.x : undefined;
    const y = typeof args.y === "number" ? args.y : undefined;
    const z = typeof args.z === "number" ? args.z : undefined;
    const count = typeof args.count === "number" && args.count > 0 ? Math.floor(args.count) : 1;

    let blockId: number | null = null;
    if (blockName) {
      const data = mcDataFor(bot);
      const info = data.blocksByName[blockName];
      if (!info) return { ok: false, message: `未知のブロック名: ${blockName}` };
      blockId = info.id;
    }

    let dug = 0;
    let lastBlockName = "";
    try {
      for (let i = 0; i < count; i++) {
        const result = await digOne(bot, blockId, x, y, z);
        if (!result.ok) {
          if (dug > 0) break; // 何個か掘れていればそこまでは成果として返す
          return { ok: false, message: result.message, data: { dug } };
        }
        dug += 1;
        lastBlockName = result.blockName;
      }
      return { ok: true, message: `${lastBlockName || blockName || "ブロック"}を${dug}個掘った`, data: { dug } };
    } catch (error) {
      return {
        ok: dug > 0,
        message: dug > 0 ? `${dug}個掘った後に失敗した` : `掘削に失敗した: ${error instanceof Error ? error.message : String(error)}`,
        data: { dug },
      };
    }
  },
};
