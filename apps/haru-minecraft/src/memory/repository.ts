import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { nowJstIso } from "../util/time.js";
import { cosineSimilarity } from "./embeddings.js";
import type {
  Episode,
  EpisodeKind,
  ReflectionRule,
  SkillLearned,
  SkillSearchResult,
  WorldFact,
  WorldFactKind,
} from "./types.js";

/**
 * (D) memory の内部API。仕様に列挙された7関数をそのまま実装する:
 * recordEpisode / addWorldFact / upsertSkill / searchSkills /
 * getActiveRules / startSession / endSession
 */

export function startSession(db: DatabaseSync, goalTitle?: string): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO sessions (id, started_at, ended_at, goal_title, result) VALUES (?, ?, NULL, ?, NULL)"
  ).run(id, nowJstIso(), goalTitle ?? null);
  return id;
}

/** SESSIONS_PER_DAY_MAX の判定用。dateJst は "YYYY-MM-DD" (JST)。 */
export function countSessionsStartedOn(db: DatabaseSync, dateJst: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM sessions WHERE started_at LIKE ?")
    .get(`${dateJst}%`) as { count: number };
  return row.count;
}

export function endSession(db: DatabaseSync, sessionId: string, result?: string): void {
  db.prepare("UPDATE sessions SET ended_at = ?, result = ? WHERE id = ?").run(
    nowJstIso(),
    result ?? null,
    sessionId
  );
}

export function recordEpisode(
  db: DatabaseSync,
  input: { sessionId: string; kind: EpisodeKind; summary: string; detail?: Record<string, unknown> }
): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO episodes (id, session_id, ts, kind, summary, detail_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    input.sessionId,
    nowJstIso(),
    input.kind,
    input.summary,
    input.detail ? JSON.stringify(input.detail) : null
  );
  return id;
}

export function addWorldFact(
  db: DatabaseSync,
  input: { kind: WorldFactKind; key: string; value: unknown }
): void {
  const existing = db
    .prepare("SELECT id FROM world_facts WHERE kind = ? AND key = ?")
    .get(input.kind, input.key) as { id: string } | undefined;

  if (existing) {
    db.prepare("UPDATE world_facts SET value_json = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(input.value),
      nowJstIso(),
      existing.id
    );
    return;
  }

  db.prepare(
    "INSERT INTO world_facts (id, kind, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(randomUUID(), input.kind, input.key, JSON.stringify(input.value), nowJstIso());
}

export function upsertSkill(
  db: DatabaseSync,
  input: {
    name: string;
    description?: string;
    steps: unknown[];
    embedding: number[];
    incrementSuccess?: boolean;
  }
): void {
  const existing = db.prepare("SELECT id, success_count FROM skills_learned WHERE name = ?").get(
    input.name
  ) as { id: string; success_count: number } | undefined;

  if (existing) {
    const nextCount = existing.success_count + (input.incrementSuccess ? 1 : 0);
    db.prepare(
      "UPDATE skills_learned SET description = ?, steps_json = ?, embedding = ?, success_count = ? WHERE id = ?"
    ).run(
      input.description ?? null,
      JSON.stringify(input.steps),
      JSON.stringify(input.embedding),
      nextCount,
      existing.id
    );
    return;
  }

  db.prepare(
    "INSERT INTO skills_learned (id, name, description, steps_json, embedding, success_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    randomUUID(),
    input.name,
    input.description ?? null,
    JSON.stringify(input.steps),
    JSON.stringify(input.embedding),
    input.incrementSuccess ? 1 : 0,
    nowJstIso()
  );
}

type SkillRow = {
  id: string;
  name: string;
  description: string | null;
  steps_json: string;
  embedding: string | null;
  success_count: number;
  created_at: string;
};

function rowToSkill(row: SkillRow): SkillLearned {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: JSON.parse(row.steps_json) as unknown[],
    embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : [],
    successCount: row.success_count,
    createdAt: row.created_at,
  };
}

export function searchSkills(
  db: DatabaseSync,
  queryEmbedding: number[],
  topK: number
): SkillSearchResult[] {
  const rows = db.prepare("SELECT * FROM skills_learned").all() as SkillRow[];
  return rows
    .map((row) => rowToSkill(row))
    .map((skill) => ({ skill, similarity: cosineSimilarity(queryEmbedding, skill.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

type RuleRow = {
  id: string;
  rule: string;
  active: number;
  created_at: string;
  source_episode_id: string | null;
};

export function getActiveRules(db: DatabaseSync): ReflectionRule[] {
  const rows = db.prepare("SELECT * FROM reflection_rules WHERE active = 1").all() as RuleRow[];
  return rows.map((row) => ({
    id: row.id,
    rule: row.rule,
    active: row.active === 1,
    createdAt: row.created_at,
    sourceEpisodeId: row.source_episode_id,
  }));
}

export function addReflectionRule(
  db: DatabaseSync,
  input: { rule: string; sourceEpisodeId?: string }
): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO reflection_rules (id, rule, active, created_at, source_episode_id) VALUES (?, ?, 1, ?, ?)"
  ).run(id, input.rule, nowJstIso(), input.sourceEpisodeId ?? null);
  return id;
}

export function listEpisodes(db: DatabaseSync, sessionId: string): Episode[] {
  const rows = db
    .prepare("SELECT * FROM episodes WHERE session_id = ? ORDER BY ts ASC")
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    ts: string;
    kind: EpisodeKind;
    summary: string;
    detail_json: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    ts: row.ts,
    kind: row.kind,
    summary: row.summary,
    detail: row.detail_json ? (JSON.parse(row.detail_json) as Record<string, unknown>) : undefined,
  }));
}

export function listWorldFacts(db: DatabaseSync, kind?: WorldFactKind): WorldFact[] {
  const rows = (
    kind
      ? db.prepare("SELECT * FROM world_facts WHERE kind = ?").all(kind)
      : db.prepare("SELECT * FROM world_facts").all()
  ) as Array<{ id: string; kind: WorldFactKind; key: string; value_json: string; updated_at: string }>;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    key: row.key,
    value: JSON.parse(row.value_json),
    updatedAt: row.updated_at,
  }));
}
