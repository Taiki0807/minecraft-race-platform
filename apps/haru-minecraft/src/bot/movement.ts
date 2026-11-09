import type { Bot } from "mineflayer";
import type { goals as PathfinderGoals } from "mineflayer-pathfinder";

/**
 * 「移動で詰まったとき」の対応(仕様追記、2026-11-09)。
 * 障害物をよけるのはボットの仕事(ハルの返事は1〜2秒かかるので歩行中の判断はできない)。
 * 歩く動作(go_to, collect, dig_block等の移動部分)はすべてこの walkTo を通すこと。
 * 実機ではまだ試していないため、詰まり判定の閾値(3秒・0.3ブロック)は様子を見て調整する。
 */
const STUCK_MS = 3_000;
const STUCK_MOVE_THRESHOLD = 0.3;
const GOTO_TIMEOUT_MS = 60_000;
const MAX_UNSTUCK_ATTEMPTS = 3;
const TREE_MATERIAL = /(_log|_leaves)$/;

function gotoWatched(
  bot: Bot,
  goal: PathfinderGoals.Goal,
  stuckMs = STUCK_MS,
  timeoutMs = GOTO_TIMEOUT_MS
): Promise<"ok" | "stuck"> {
  return new Promise((resolve) => {
    let last = bot.entity.position.clone();
    let since = Date.now();
    const start = Date.now();
    const timer = setInterval(() => {
      const p = bot.entity.position;
      if (p.distanceTo(last) > STUCK_MOVE_THRESHOLD) {
        last = p.clone();
        since = Date.now();
      } else if (Date.now() - since > stuckMs || Date.now() - start > timeoutMs) {
        bot.pathfinder.stop();
      }
    }, 250);

    bot.pathfinder
      .goto(goal)
      .then(() => resolve("ok"))
      .catch(() => resolve("stuck"))
      .finally(() => clearInterval(timer));
  });
}

/** 正面の木・葉を壊し、少し下がって横へずれる(詰まり解消)。 */
async function unstuck(bot: Bot): Promise<void> {
  const yaw = bot.entity.yaw;
  const front = bot.entity.position.offset(-Math.sin(yaw), 0, -Math.cos(yaw)).floored();
  for (const b of [bot.blockAt(front), bot.blockAt(front.offset(0, 1, 0))]) {
    if (b && TREE_MATERIAL.test(b.name) && bot.canDigBlock(b)) {
      await bot.dig(b);
    }
  }
  bot.setControlState("back", true);
  await bot.waitForTicks(6);
  bot.clearControlStates();
  bot.setControlState(Math.random() < 0.5 ? "left" : "right", true);
  bot.setControlState("jump", true);
  await bot.waitForTicks(10);
  bot.clearControlStates();
}

/**
 * 歩く動作はすべてこれを通す。詰まったら壊して避けて再挑戦し、3回失敗したら
 * 「木にぶつかって進めない」として諦める(ハルに同じ動作を繰り返させないため)。
 */
export async function walkTo(
  bot: Bot,
  goal: PathfinderGoals.Goal
): Promise<{ ok: boolean; message: string }> {
  for (let i = 0; i < MAX_UNSTUCK_ATTEMPTS; i++) {
    if ((await gotoWatched(bot, goal)) === "ok") {
      return { ok: true, message: "移動完了" };
    }
    await unstuck(bot);
  }
  return { ok: false, message: "失敗: 木にぶつかって進めない(3回やり直した)" };
}
