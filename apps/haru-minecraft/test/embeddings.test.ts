import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cosineSimilarity,
  generateEmbedding,
  hashEmbedding,
  normalizeVector,
} from "../src/memory/embeddings.js";

describe("hashEmbedding", () => {
  it("is deterministic for the same text", () => {
    expect(hashEmbedding("鉄を集める")).toEqual(hashEmbedding("鉄を集める"));
  });

  it("produces different vectors for different text", () => {
    expect(hashEmbedding("鉄を集める")).not.toEqual(hashEmbedding("木を切る"));
  });

  it("returns a unit-length vector (or zero vector for empty input)", () => {
    const vector = hashEmbedding("ダイヤを探す");
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });
});

describe("normalizeVector", () => {
  it("scales a vector to unit length", () => {
    const normalized = normalizeVector([3, 4]);
    expect(normalized[0]).toBeCloseTo(0.6, 5);
    expect(normalized[1]).toBeCloseTo(0.8, 5);
  });

  it("leaves an all-zero vector unchanged", () => {
    expect(normalizeVector([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("is 0 when either vector has zero magnitude", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("ranks a closer hash-embedding higher than an unrelated one", () => {
    const query = hashEmbedding("鉄を集める");
    const related = hashEmbedding("鉄を集める 完了");
    const unrelated = hashEmbedding("ベッドで寝る");
    expect(cosineSimilarity(query, related)).toBeGreaterThan(cosineSimilarity(query, unrelated));
  });
});

describe("generateEmbedding (ollama provider sends Authorization)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ embedding: [0.1, 0.2] }) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a Bearer token header when configured", async () => {
    await generateEmbedding("test", {
      provider: "ollama",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "nomic-embed-text",
      ollamaToken: "secret-token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/embeddings",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret-token" }) })
    );
  });

  it("falls back to hashEmbedding when the ollama call fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await generateEmbedding("鉄を集める", {
      provider: "ollama",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "nomic-embed-text",
    });
    expect(result).toEqual(hashEmbedding("鉄を集める"));
  });
});
