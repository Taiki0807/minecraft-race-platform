import { createBot as mineflayerCreateBot, type Bot } from "mineflayer";
import { Movements, pathfinder } from "mineflayer-pathfinder";

export type BotConnectionConfig = {
  host: string;
  port: number;
  username: string;
  auth: "offline" | "microsoft";
};

/** mineflayer bot を作り、pathfinder プラグインを読み込んで返す。 */
export function createMinecraftBot(config: BotConnectionConfig): Bot {
  const bot = mineflayerCreateBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: config.auth,
  });

  bot.loadPlugin(pathfinder);

  bot.once("spawn", () => {
    bot.pathfinder.setMovements(new Movements(bot));
  });

  return bot;
}
