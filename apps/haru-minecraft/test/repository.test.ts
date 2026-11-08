import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/memory/db.js";
import {
  addReflectionRule,
  addWorldFact,
  countSessionsStartedOn,
  endSession,
  getActiveRules,
  listEpisodes,
  listWorldFacts,
  recordEpisode,
  searchSkills,
  startSession,
  upsertSkill,
} from "../src/memory/repository.js";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

describe("sessions", () => {
  it("starts and ends a session", () => {
    const id = startSession(db, "鉄装備を作る");
    endSession(db, id, "success");
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown>;
    expect(row.goal_title).toBe("鉄装備を作る");
    expect(row.result).toBe("success");
    expect(row.ended_at).not.toBeNull();
  });
});

describe("episodes", () => {
  it("records and lists episodes for a session in order", () => {
    const sessionId = startSession(db);
    recordEpisode(db, { sessionId, kind: "discovery", summary: "洞窟を見つけた" });
    recordEpisode(db, { sessionId, kind: "death", summary: "溶岩に落ちた", detail: { cause: "lava" } });

    const episodes = listEpisodes(db, sessionId);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]?.summary).toBe("洞窟を見つけた");
    expect(episodes[1]?.detail).toEqual({ cause: "lava" });
  });
});

describe("countSessionsStartedOn", () => {
  it("counts only sessions whose started_at falls on the given JST date", () => {
    db.prepare(
      "INSERT INTO sessions (id, started_at, ended_at, goal_title, result) VALUES (?, ?, NULL, NULL, NULL)"
    ).run("a", "2026-11-07T10:00:00+09:00");
    db.prepare(
      "INSERT INTO sessions (id, started_at, ended_at, goal_title, result) VALUES (?, ?, NULL, NULL, NULL)"
    ).run("b", "2026-11-07T20:00:00+09:00");
    db.prepare(
      "INSERT INTO sessions (id, started_at, ended_at, goal_title, result) VALUES (?, ?, NULL, NULL, NULL)"
    ).run("c", "2026-11-08T01:00:00+09:00");

    expect(countSessionsStartedOn(db, "2026-11-07")).toBe(2);
    expect(countSessionsStartedOn(db, "2026-11-08")).toBe(1);
    expect(countSessionsStartedOn(db, "2026-11-09")).toBe(0);
  });
});

describe("world facts", () => {
  it("inserts a new fact then upserts in place on the same kind/key", () => {
    addWorldFact(db, { kind: "base", key: "home", value: { x: 1, y: 2, z: 3 } });
    addWorldFact(db, { kind: "base", key: "home", value: { x: 9, y: 9, z: 9 } });

    const facts = listWorldFacts(db, "base");
    expect(facts).toHaveLength(1);
    expect(facts[0]?.value).toEqual({ x: 9, y: 9, z: 9 });
  });
});

describe("skills", () => {
  it("inserts a new skill then updates success_count on repeated success", () => {
    upsertSkill(db, { name: "mine_iron", steps: [{ tool: "dig_block" }], embedding: [1, 0] });
    upsertSkill(db, {
      name: "mine_iron",
      steps: [{ tool: "dig_block" }],
      embedding: [1, 0],
      incrementSuccess: true,
    });

    const row = db.prepare("SELECT success_count FROM skills_learned WHERE name = ?").get(
      "mine_iron"
    ) as { success_count: number };
    expect(row.success_count).toBe(1);
  });

  it("ranks skills by cosine similarity to the query embedding", () => {
    upsertSkill(db, { name: "mine_iron", steps: [], embedding: [1, 0] });
    upsertSkill(db, { name: "chop_wood", steps: [], embedding: [0, 1] });

    const results = searchSkills(db, [1, 0], 1);
    expect(results).toHaveLength(1);
    expect(results[0]?.skill.name).toBe("mine_iron");
  });
});

describe("reflection rules", () => {
  it("returns only active rules", () => {
    const id = addReflectionRule(db, { rule: "夜は拠点に戻る" });
    db.prepare("UPDATE reflection_rules SET active = 0 WHERE id = ?").run(
      addReflectionRule(db, { rule: "使われない旧ルール" })
    );

    const active = getActiveRules(db);
    expect(active.map((r) => r.id)).toEqual([id]);
  });
});
