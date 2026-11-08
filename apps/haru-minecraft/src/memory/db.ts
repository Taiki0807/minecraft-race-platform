import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

/**
 * (D) memory の保存形式。SQLite 単一ファイル。
 * Creator Studio のログDBとは意図的に別ファイル(仕様どおり)。
 * Creator Studio が node:sqlite(DatabaseSync) を使っているのに合わせ、
 * 外部依存(better-sqlite3等)を追加しない。
 *
 * node:sqlite は createRequire 経由で読み込む。静的な
 * `import ... from "node:sqlite"` だと Vitest(Vite)のビルトイン判定が
 * この新しいモジュールを認識せず解決に失敗するため。
 */
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  goal_title TEXT,
  result TEXT
);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);

CREATE TABLE IF NOT EXISTS skills_learned (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  steps_json TEXT NOT NULL,
  embedding TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_facts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_world_facts_kind_key ON world_facts(kind, key);

CREATE TABLE IF NOT EXISTS reflection_rules (
  id TEXT PRIMARY KEY,
  rule TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  source_episode_id TEXT
);
`;

export function openDatabase(dbPath: string): DatabaseSyncType {
  const dir = path.dirname(dbPath);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}
