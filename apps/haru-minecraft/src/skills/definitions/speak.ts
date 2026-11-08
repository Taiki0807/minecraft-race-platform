import type { Skill } from "../types.js";

/**
 * speak{text}: ゲーム内では実行しない。brain/loop.ts がこの名前を特別扱いし、
 * (A) の say イベントへ変換してbridgeに流す。ここでの handler はその経路を
 * 経ずに直接 registry.execute("speak", ...) された場合の安全なフォールバック。
 */
export const speakSkill: Skill = {
  definition: {
    name: "speak",
    description:
      "思ったことや次にすることを一言つぶやく(1〜2文、記号・絵文字なし)。ゲーム内の動作ではない。",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "発話内容(1〜2文)" },
      },
      required: ["text"],
    },
  },
  timeoutMs: 1_000,
  handler: async (_ctx, args) => {
    const text = typeof args.text === "string" ? args.text : "";
    return { ok: true, message: "発話はbridge経由で処理される", data: { text } };
  },
};
