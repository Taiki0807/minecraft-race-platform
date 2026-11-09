import type { GameState } from "../bot/state.js";
import type { ReflectionRule } from "../memory/types.js";

/**
 * システムプロンプトを組み立てる。
 *
 * シャノンの教訓(23,000字の巨大プロンプト→45秒応答 / 700字程度への圧縮→1.2秒)を
 * 踏まえ、ツール定義の説明や巨大なルール集をここに埋め込まない。
 * ツール定義はLLMProviderのtoolsパラメータ側(またはhome-llmアダプタの専用指示)で渡し、
 * ここでは「人格・最低限の行動方針・現在の状態・学んだ教訓」だけに絞る。
 */
export function buildSystemPrompt(
  personaPrompt: string,
  state: GameState,
  rules: ReflectionRule[],
  skillHints: string[] = []
): string {
  const rulesText = rules.length > 0 ? rules.map((r) => `- ${r.rule}`).join("\n") : "(なし)";
  const hintsText = skillHints.length > 0 ? skillHints.map((h) => `- ${h}`).join("\n") : "(なし)";

  return [
    personaPrompt,
    "",
    "[マイクラでの振る舞い]",
    "- 判断するたびに speak で一言つぶやく(1〜2文、記号・絵文字なし、気だるげな独り言調)",
    '- 「〜していきます！」のような実況・ナレーター口調は使わない',
    "",
    `[状態] HP:${state.hp} 満腹:${state.food} 座標:(${state.position.x}, ${state.position.y}, ${state.position.z}) ${state.isDay ? "昼" : "夜"}`,
    `足元: ${state.ground}${state.groundHint}`,
    ...(state.dangerText ? [state.dangerText] : []),
    "",
    "[学んだ教訓]",
    rulesText,
    "",
    "[過去に似た場面で成功した行動]",
    hintsText,
  ].join("\n");
}
