import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";

const MAX_SCAN_DOWN = 60;

// 葉っぱ・原木など「木の上に乗ってしまった」を示すブロック。boundingBoxだけでは
// 普通の地面(stone/dirt等も"block")と区別できないため、名前で判定する。
export function isTreeMaterial(name: string): boolean {
  return name.includes("leaves") || name.endsWith("_log") || name.endsWith("_wood");
}

/**
 * standingYの1つ下から走査し、木材でない固体ブロック+真上が空気の最初のY(立てる高さ)
 * を返す。見つからなければnull。go_down の実行と、状態表示(足元ヒント)の両方で使う。
 */
export function findRealGroundY(bot: Bot, x: number, z: number, standingY: number): number | null {
  const minY = standingY - MAX_SCAN_DOWN;
  for (let y = standingY - 1; y >= minY; y--) {
    const below = bot.blockAt(new Vec3(x, y, z));
    const at = bot.blockAt(new Vec3(x, y + 1, z));
    if (below && at && below.boundingBox === "block" && !isTreeMaterial(below.name) && at.boundingBox === "empty") {
      return y + 1;
    }
  }
  return null;
}
