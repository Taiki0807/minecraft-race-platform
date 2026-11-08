/**
 * (D) memory の embedding。「ローカル埋め込みモデルで生成し、検索はcosine総当たり」。
 *
 * 2経路:
 *  - EMBEDDING_PROVIDER=ollama: Ollama の /api/embeddings (本命)
 *  - EMBEDDING_PROVIDER=hash:   決定論的なハッシュベクトル(フォールバック)
 *
 * hash方式は意味的な類似度を持たない「配線確認用の代用品」。Phase 1で
 * 実際の埋め込みモデルを用意するまで、searchSkills の経路自体は
 * 動く状態にしておくためのもの — 本番の検索品質には使わないこと。
 */

export type EmbeddingConfig = {
  provider: "ollama" | "hash";
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaToken?: string;
};

const HASH_DIMENSIONS = 64;

/** 決定論的・依存ライブラリなしの疑似embedding。意味的類似度は保証しない。 */
export function hashEmbedding(text: string, dims: number = HASH_DIMENSIONS): number[] {
  const vector = new Array<number>(dims).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const codePoint = normalized.codePointAt(i) ?? 0;
    const bucket = (codePoint * 2654435761) % dims;
    const index = (bucket + dims) % dims;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  return normalizeVector(vector);
}

export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function ollamaEmbedding(text: string, baseUrl: string, model: string, token?: string): Promise<number[]> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ model, prompt: text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Ollama embeddings がエラーを返しました (status: ${response.status})`);
  }
  const json = (await response.json()) as { embedding?: number[] };
  if (!Array.isArray(json.embedding)) {
    throw new Error("Ollama embeddings の応答形式が想定と一致しません");
  }
  return json.embedding;
}

export async function generateEmbedding(text: string, config: EmbeddingConfig): Promise<number[]> {
  if (config.provider === "ollama") {
    try {
      return await ollamaEmbedding(text, config.ollamaBaseUrl, config.ollamaModel, config.ollamaToken);
    } catch {
      // Ollamaが使えない場合はhashへフォールバックし、検索自体は止めない。
      return hashEmbedding(text);
    }
  }
  return hashEmbedding(text);
}
