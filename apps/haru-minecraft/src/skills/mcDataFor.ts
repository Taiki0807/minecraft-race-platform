import mcDataLoader, { type IndexedData } from "minecraft-data";
import type { Bot } from "mineflayer";

export function mcDataFor(bot: Bot): IndexedData {
  return mcDataLoader(bot.version);
}
