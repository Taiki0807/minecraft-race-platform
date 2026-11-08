import type { Bot } from "mineflayer";

export type GameState = {
  hp: number;
  food: number;
  position: { x: number; y: number; z: number };
  timeOfDay: number;
  isDay: boolean;
  inventory: Array<{ name: string; count: number }>;
  nearbyEntities: Array<{ name: string; distance: number }>;
};

/** get_state{} の実体。LLMへ渡す一人称視点の状態スナップショットを組み立てる。 */
export function buildState(bot: Bot): GameState {
  const position = bot.entity.position;
  const inventory = bot.inventory.items().map((item) => ({ name: item.name, count: item.count }));

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
    timeOfDay: bot.time.timeOfDay,
    isDay: bot.time.isDay,
    inventory,
    nearbyEntities,
  };
}
