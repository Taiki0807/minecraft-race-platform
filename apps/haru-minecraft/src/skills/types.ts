/**
 * (C) スキル(ツール)定義 v1。
 * 共通の戻り値形式: {ok, message, data?}。message はそのままLLMへの
 * 環境フィードバックになるので、失敗理由は具体的に書く(例:「鉄が足りない」)。
 */
export type SkillResult = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
};

/** Tool Use/Function Calling の tools パラメータに渡すJSON Schema形式。 */
export type ToolParameterSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
};

export type SkillContext = {
  bot: unknown; // mineflayer Bot。skills はこれを通じてゲームを操作する。
};

export type SkillHandler<TArgs = Record<string, unknown>> = (
  ctx: SkillContext,
  args: TArgs
) => Promise<SkillResult>;

export type Skill = {
  definition: ToolDefinition;
  timeoutMs: number;
  handler: SkillHandler;
};

export function timeoutResult(): SkillResult {
  return { ok: false, message: "timeout" };
}
