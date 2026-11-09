import type { Bot } from "mineflayer";
import type { Entity } from "prismarine-entity";

/**
 * 仕様追記(2026-11-09, 危険の判断)。小さいモデルは敵の数の判断を誤りやすい
 * (48試行中12誤り)ため、逃げる/戦うの判断はLLMではなくボット側で計算する。
 * HP<10、クリーパーが近くにいる、敵合計3体以上のいずれかなら逃げる。
 */
const FLEE_HP_THRESHOLD = 10;
const FLEE_ENEMY_COUNT = 3;
const DANGER_RANGE = 16;

export type DangerJudgment = {
  shouldFlee: boolean;
  hostileCount: number;
  hasCreeper: boolean;
  text: string;
};

function isHostile(entity: Entity): boolean {
  return entity.kind === "Hostile mobs";
}

/** 周囲(16ブロック以内)の敵対モブから、逃げるべきか戦えるかを判断する。敵がいなければnull。 */
export function computeDangerJudgment(bot: Bot): DangerJudgment | null {
  const position = bot.entity.position;
  const hostiles = Object.values(bot.entities).filter(
    (entity) =>
      entity.id !== bot.entity.id && isHostile(entity) && entity.position.distanceTo(position) <= DANGER_RANGE
  );
  if (hostiles.length === 0) return null;

  const hostileCount = hostiles.length;
  const hasCreeper = hostiles.some((entity) => entity.name === "creeper");
  const shouldFlee = bot.health < FLEE_HP_THRESHOLD || hasCreeper || hostileCount >= FLEE_ENEMY_COUNT;

  const text = shouldFlee
    ? `危険の判断: 逃げる（敵が合わせて${hostileCount}体）`
    : `危険の判断: 戦える（体力${bot.health}、敵は${hostileCount}体）`;

  return { shouldFlee, hostileCount, hasCreeper, text };
}

/** 周囲の敵対モブ一覧(attack/fleeで使う)。 */
export function nearbyHostiles(bot: Bot): Entity[] {
  const position = bot.entity.position;
  return Object.values(bot.entities).filter(
    (entity) =>
      entity.id !== bot.entity.id && isHostile(entity) && entity.position.distanceTo(position) <= DANGER_RANGE
  );
}
