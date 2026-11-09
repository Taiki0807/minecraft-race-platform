import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { findRealGroundY, isTreeMaterial } from "./ground.js";
import { computeDangerJudgment } from "./danger.js";

export type GameState = {
  hp: number;
  food: number;
  position: { x: number; y: number; z: number };
  /**
   * 足元(1マス下)のブロック名。"oak_leaves"なら木の上に乗っている、"air"なら
   * 何も無い(落下中・崖の上など)、"water"なら水上。go_downを使うべきかの判断材料。
   */
  ground: string;
  /**
   * 仕様追記(2026-11-09, 足元状態の強化)。木の上にいるとき等、実際の地面との
   * 距離を含む補足文(例:「。今は木の上にいる（地面は y=64、8ブロック下）」)。
   * 無ければ空文字。
   */
  groundHint: string;
  /** 仕様追記(2026-11-09, 危険の判断)。周囲に敵がいなければnull。 */
  dangerText: string | null;
  timeOfDay: number;
  isDay: boolean;
  inventory: Array<{ name: string; count: number }>;
  nearbyEntities: Array<{ name: string; distance: number }>;
};

function buildGroundHint(bot: Bot, position: { x: number; y: number; z: number }, ground: string): string {
  if (isTreeMaterial(ground)) {
    const standingY = Math.floor(position.y) - 1;
    const realGroundY = findRealGroundY(bot, Math.floor(position.x), Math.floor(position.z), standingY);
    if (realGroundY === null) return "。今は木の上にいる（地面が近くに見つからない）";
    const blocksDown = Math.floor(position.y) - realGroundY;
    return `。今は木の上にいる（地面は y=${realGroundY}、${blocksDown}ブロック下）`;
  }
  if (ground === "air") return "。何も無い(落下中かも)";
  return "";
}

/** get_state{} の実体。LLMへ渡す一人称視点の状態スナップショットを組み立てる。 */
export function buildState(bot: Bot): GameState {
  const position = bot.entity.position;
  const inventory = bot.inventory.items().map((item) => ({ name: item.name, count: item.count }));

  const groundPosition = new Vec3(Math.floor(position.x), Math.floor(position.y) - 1, Math.floor(position.z));
  const ground = bot.blockAt(groundPosition)?.name ?? "unknown";
  const groundHint = buildGroundHint(bot, position, ground);

  const danger = computeDangerJudgment(bot);

  const nearbyEntities = Object.values(bot.entities)
    .filter((entity) => entity.id !== bot.entity.id && entity.position)
    .map((entity) => ({
      name: entity.name ?? entity.username ?? entity.displayName ?? "unknown",
      distance: entity.position.distanceTo(position),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  return {
    hp: bot.health,
    food: bot.food,
    position: { x: position.x, y: position.y, z: position.z },
    ground,
    groundHint,
    dangerText: danger?.text ?? null,
    timeOfDay: bot.time.timeOfDay,
    isDay: bot.time.isDay,
    inventory,
    nearbyEntities,
  };
}
