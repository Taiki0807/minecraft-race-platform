import type { Bot } from "mineflayer";
import type { Entity } from "prismarine-entity";
import { goals } from "../pathfinderGoals.js";
import { walkTo } from "../../bot/movement.js";
import type { Skill } from "../types.js";

const ATTACK_RANGE = 32;
const MELEE_RANGE = 3;
const MAX_HITS = 10;
const HIT_INTERVAL_MS = 650;

/** 装備できる武器の中で最良のものを探す。無ければ素手(null)。 */
function bestWeapon(bot: Bot) {
  const weapons = bot.inventory
    .items()
    .filter((item) => item.name.endsWith("_sword") || item.name.endsWith("_axe"));
  const rank = (name: string) =>
    ["netherite", "diamond", "iron", "stone", "golden", "wooden"].findIndex((tier) => name.startsWith(tier));
  weapons.sort((a, b) => {
    const ra = rank(a.name) === -1 ? 99 : rank(a.name);
    const rb = rank(b.name) === -1 ? 99 : rank(b.name);
    if (a.name.endsWith("_sword") !== b.name.endsWith("_sword")) return a.name.endsWith("_sword") ? -1 : 1;
    return ra - rb;
  });
  return weapons[0] ?? null;
}

function findTarget(bot: Bot, name: string): Entity | null {
  const position = bot.entity.position;
  const candidates = Object.values(bot.entities).filter(
    (entity) =>
      entity.id !== bot.entity.id &&
      (entity.name === name || entity.username === name || entity.displayName === name) &&
      entity.position.distanceTo(position) <= ATTACK_RANGE
  );
  candidates.sort((a, b) => a.position.distanceTo(position) - b.position.distanceTo(position));
  return candidates[0] ?? null;
}

export const attackSkill: Skill = {
  definition: {
    name: "attack",
    description: "指定した名前の敵を、手持ちの最良の武器(無ければ素手)で攻撃する。",
    parameters: {
      type: "object",
      properties: { target: { type: "string", description: "敵のエンティティ名(例: zombie, skeleton)" } },
      required: ["target"],
    },
  },
  timeoutMs: 30_000,
  handler: async (ctx, args) => {
    const bot = ctx.bot as Bot;
    const targetName = typeof args.target === "string" ? args.target : "";

    let entity = findTarget(bot, targetName);
    if (!entity) return { ok: false, message: `周囲に${targetName || "対象"}が見つからない` };

    const weapon = bestWeapon(bot);
    if (weapon) await bot.equip(weapon, "hand");

    let hits = 0;
    try {
      for (let i = 0; i < MAX_HITS; i++) {
        entity = findTarget(bot, targetName);
        if (!entity) break; // 倒した、または逃げられた

        if (bot.entity.position.distanceTo(entity.position) > MELEE_RANGE) {
          const moveResult = await walkTo(
            bot,
            new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, 1)
          );
          if (!moveResult.ok) return { ok: hits > 0, message: hits > 0 ? `${hits}回攻撃したが接近できなくなった` : moveResult.message };
        }

        bot.attack(entity);
        hits += 1;
        await bot.waitForTicks(Math.round((HIT_INTERVAL_MS / 50)));
      }
    } catch (error) {
      return {
        ok: hits > 0,
        message: hits > 0 ? `${hits}回攻撃した後に中断した` : `攻撃に失敗した: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const stillThere = findTarget(bot, targetName) !== null;
    return stillThere
      ? { ok: hits > 0, message: `${targetName}を${hits}回攻撃した(まだ生きている)` }
      : { ok: true, message: `${targetName}を倒した、または追い払った(${hits}回攻撃)` };
  },
};
