import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";

export type GameState = {
  hp: number;
  food: number;
  position: { x: number; y: number; z: number };
  /**
   * 足元(1マス下)のブロック名。"oak_leaves"なら木の上に乗っている、"air"なら
   * 何も無い(落下中・崖の上など)、"water"なら水上。go_downを使うべきかの判断材料。
   */
  ground: string;
  timeOfDay: number;
  isDay: boolean;
  inventory: Array<{ name: string; count: number }>;
  nearbyEntities: Array<{ name: string; distance: number }>;
};

/** get_state{} の実体。LLMへ渡す一人称視点の状態スナップショットを組み立てる。 */
export function buildState(bot: Bot): GameState {
  const position = bot.entity.position;
  const inventory = bot.inventory.items().map((item) => ({ name: item.name, count: item.count }));

  const groundPosition = new Vec3(Math.floor(position.x), Math.floor(position.y) - 1, Math.floor(position.z));
  const ground = bot.blockAt(groundPosition)?.name ?? "unknown";

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
    timeOfDay: bot.time.timeOfDay,
    isDay: bot.time.isDay,
    inventory,
    nearbyEntities,
  };
}
