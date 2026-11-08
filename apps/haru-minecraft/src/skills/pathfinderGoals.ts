import pathfinderPkg from "mineflayer-pathfinder";

/**
 * mineflayer-pathfinder はCJSパッケージで、Node実行時のESM相互運用では
 * "goals" が名前付きエクスポートとして検出されない
 * (`import { goals } from "mineflayer-pathfinder"` が
 * "does not provide an export named 'goals'" で実際に落ちることを確認済み。
 * Movements/pathfinderは検出されるのでこの問題はgoalsだけに起きる)。
 * default importから取り出して安全に再エクスポートする。
 */
export const { goals } = pathfinderPkg;
