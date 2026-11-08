export type EpisodeKind = "death" | "achievement" | "stuck" | "discovery" | "note";
export type WorldFactKind = "base" | "resource" | "danger" | "poi";

export type Session = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  goalTitle: string | null;
  result: string | null;
};

export type Episode = {
  id: string;
  sessionId: string;
  ts: string;
  kind: EpisodeKind;
  summary: string;
  detail?: Record<string, unknown>;
};

export type SkillLearned = {
  id: string;
  name: string;
  description: string | null;
  steps: unknown[];
  embedding: number[];
  successCount: number;
  createdAt: string;
};

export type WorldFact = {
  id: string;
  kind: WorldFactKind;
  key: string;
  value: unknown;
  updatedAt: string;
};

export type ReflectionRule = {
  id: string;
  rule: string;
  active: boolean;
  createdAt: string;
  sourceEpisodeId: string | null;
};

export type SkillSearchResult = {
  skill: SkillLearned;
  similarity: number;
};
