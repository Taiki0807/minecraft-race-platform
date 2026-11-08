import type { Skill } from "../types.js";

const MAX_SECONDS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const waitSkill: Skill = {
  definition: {
    name: "wait",
    description: "指定秒数だけ何もせず待機する。",
    parameters: {
      type: "object",
      properties: {
        seconds: { type: "number" },
      },
      required: ["seconds"],
    },
  },
  timeoutMs: (MAX_SECONDS + 5) * 1000,
  handler: async (_ctx, args) => {
    const requested = typeof args.seconds === "number" ? args.seconds : 1;
    const seconds = Math.max(0, Math.min(requested, MAX_SECONDS));
    await delay(seconds * 1000);
    return { ok: true, message: `${seconds}秒待機した` };
  },
};
