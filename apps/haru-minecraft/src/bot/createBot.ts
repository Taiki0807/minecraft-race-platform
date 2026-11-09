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
    const movements = new Movements(bot);
    // 仕様追記(2026-11-09, 移動で詰まったとき対応): 邪魔な葉っぱ・木を壊して
    // 通れるようにする。パルクール・スプリントも許可して経路の柔軟性を上げる。
    movements.canDig = true;
    movements.allowParkour = true;
    movements.allowSprinting = true;
    bot.pathfinder.setMovements(movements);
  });

  return bot;
}
