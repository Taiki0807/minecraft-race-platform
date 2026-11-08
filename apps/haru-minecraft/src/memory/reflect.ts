import type { DatabaseSync } from "node:sqlite";
import type { LLMProvider } from "../brain/llmProvider.js";
import type { SkillResult } from "../skills/types.js";
import { addReflectionRule, listEpisodes } from "./repository.js";
import type { Episode, EpisodeKind, SkillSearchResult } from "./types.js";

/**
 * (D) memory の「学習」側。
 * - classifyToolEpisode: ツール実行結果をエピソードとして残すべきか判定する
 * - skillKeyFor / describeArgs: 学習済みスキルのキー・説明文を作る
 * - buildReflectionRequest / extractRuleText / runReflectionPass: 振り返り(反省ルール抽出)
 *
 * 「夜間バッチ」の代わりに、セッション終了時にそのセッション分のエピソードを振り返る形にした
 * (このプロセスは常駐するため、日次バッチよりセッション終了が自然な区切りになる)。
 */

export function describeArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(",");
}

/** upsertSkill のキー。ツール名+主要な対象(item/block)で同種の行動をまとめる。 */
export function skillKeyFor(name: string, args: Record<string, unknown>): string {
  const primary = args.item ?? args.block ?? "";
  return primary ? `${name}:${primary}` : name;
}

export type ToolEpisodeClassification = { kind: EpisodeKind; summary: string } | null;

// 全ツール実行を記録するとログが溢れるため、学習上意味のある成功/失敗だけを対象にする。
const NOTABLE_SUCCESS_TOOLS = new Set(["collect", "craft_item", "dig_block", "find_blocks"]);

export function classifyToolEpisode(
  name: string,
  args: Record<string, unknown>,
  result: SkillResult
): ToolEpisodeClassification {
  if (!result.ok) {
    return { kind: "stuck", summary: `${name}(${describeArgs(args)}) に失敗: ${result.message}` };
  }
  if (NOTABLE_SUCCESS_TOOLS.has(name)) {
    return {
      kind: name === "find_blocks" ? "discovery" : "achievement",
      summary: `${name}(${describeArgs(args)}) に成功: ${result.message}`,
    };
  }
  return null;
}

export function formatSkillHints(results: SkillSearchResult[]): string[] {
  return results
    .filter((r) => r.similarity > 0)
    .map((r) => r.skill.description || r.skill.name);
}

const REFLECTION_KINDS: ReadonlySet<EpisodeKind> = new Set(["stuck", "death"]);

export type ReflectionRequest = {
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  targets: Episode[];
};

export function buildReflectionRequest(episodes: Episode[]): ReflectionRequest | null {
  const targets = episodes.filter((e) => REFLECTION_KINDS.has(e.kind));
  if (targets.length === 0) return null;

  const bullets = targets.map((e) => `- (${e.kind}) ${e.summary}`).join("\n");
  return {
    system:
      "あなたはマイクラプレイの振り返りを行うアシスタントです。次の出来事の一覧から、" +
      "今後同じ失敗を避けるための短い教訓を日本語で1行だけ提案してください。他の説明や前置きは書かないこと。",
    messages: [{ role: "user", content: bullets }],
    targets,
  };
}

export function extractRuleText(responseText: string | undefined): string | null {
  const text = (responseText ?? "").trim();
  if (!text) return null;
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return firstLine.length > 0 ? firstLine : null;
}

/** セッション終了時に呼ぶ。失敗/死亡エピソードがあれば、LLMに1行の教訓を提案させて保存する。 */
export async function runReflectionPass(
  llm: LLMProvider,
  db: DatabaseSync,
  sessionId: string
): Promise<string | null> {
  const episodes = listEpisodes(db, sessionId);
  const request = buildReflectionRequest(episodes);
  if (!request) return null;

  const response = await llm.chat({ system: request.system, messages: request.messages, tools: [] });
  const rule = extractRuleText(response.text);
  if (!rule) return null;

  const lastTarget = request.targets[request.targets.length - 1];
  addReflectionRule(db, { rule, sourceEpisodeId: lastTarget?.id });
  return rule;
}
