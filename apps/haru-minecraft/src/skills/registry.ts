import type { Skill, SkillContext, SkillResult, ToolDefinition } from "./types.js";
import { timeoutResult } from "./types.js";

/**
 * スキルの登録・検索・タイムアウト付き実行を担う。
 * 「各スキルにはタイムアウトがあり、タイムアウト時は {ok:false, message:"timeout"}」を
 * ここで一元的に保証する — 個々のスキル実装はタイムアウトを意識しなくてよい。
 */
export class SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.definition.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  listToolDefinitions(): ToolDefinition[] {
    return Array.from(this.skills.values()).map((skill) => skill.definition);
  }

  async execute(name: string, ctx: SkillContext, args: Record<string, unknown>): Promise<SkillResult> {
    const skill = this.skills.get(name);
    if (!skill) {
      return { ok: false, message: `未知のツールです: ${name}` };
    }

    return Promise.race([
      skill.handler(ctx, args),
      new Promise<SkillResult>((resolve) => {
        setTimeout(() => resolve(timeoutResult()), skill.timeoutMs);
      }),
    ]);
  }
}
