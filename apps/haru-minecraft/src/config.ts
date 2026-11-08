/**
 * 環境変数の読み込み。ハル・マイクラ API仕様 v1 (2026-11-07) に沿った命名。
 * Secretはここでだけ読む。ログ・HTTPレスポンス・リポジトリへは絶対に出さない。
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。.env.example を参考に .env を作成してください。`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  /**
   * (A) Creator Studio 管理画面のイベント受信先。
   * このプロセスはProxmoxで、Creator StudioはMacで動く前提なので、本番では
   * localhostではなくMac側の実アドレスを指定する(既定値はローカル開発用)。
   */
  studioBaseUrl: optional("STUDIO_BASE_URL", "http://127.0.0.1:3100"),
  studioToken: process.env.STUDIO_TOKEN ?? "",

  /** (A) brain 自身が持つ制御サーバー。 */
  brainPort: Number(optional("BRAIN_PORT", "3200")),
  brainToken: process.env.BRAIN_TOKEN ?? "",

  /**
   * (B) LLM。
   * - "haru-chat": 2026-11-09仕様改定版の /chat。ネイティブtools対応、本命
   * - "home-llm": 改定前の /chat。JSON指示埋め込みの互換モード(もう古い)
   * - "ollama": 別エンドポイント(将来、別モデルに切り替える場合用)
   */
  llmProvider: optional("LLM_PROVIDER", "haru-chat") as "haru-chat" | "ollama" | "home-llm",

  // haru-chat と home-llm は同じ実体(/chat, chat.hosokawa-lab.dev)を指す。
  // Creator Studio の lib/ai/local-llm.ts と同じURL/トークン。
  homeLlmBaseUrl: optional("LOCAL_LLM_URL", "https://chat.hosokawa-lab.dev"),
  homeLlmToken: process.env.LOCAL_LLM_TOKEN ?? "",
  // 指示が無いときにハルが自分で次の行動を決めるモード。既定で有効
  // (このプロセスには「視聴者からの具体的な指示」という概念がまだ無く、常にambientな判断のため)。
  haruChatAutonomous: optional("HARU_CHAT_AUTONOMOUS", "true") === "true",

  ollamaBaseUrl: optional("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
  ollamaModel: optional("OLLAMA_MODEL", "qwen2.5:14b"),
  ollamaToken: process.env.OLLAMA_TOKEN ?? "",

  llmTimeoutMs: Number(optional("LLM_TIMEOUT_MS", "60000")),

  /** (D) memory */
  dbPath: optional("HARU_MINECRAFT_DB_PATH", "data/haru-minecraft.db"),
  embeddingProvider: optional("EMBEDDING_PROVIDER", "hash") as "ollama" | "hash",
  embeddingModel: optional("EMBEDDING_MODEL", "nomic-embed-text"),

  /**
   * ゲーム接続。Mineflayer本体をこのプロセス内で直接使う(HTTPに分離しない)。
   * レース大会用とは別の、ハル専用・常時稼働のPaperサーバー(Tailscaleホスト名
   * haru-minecraft)を使う前提。
   */
  mcHost: optional("MC_HOST", "haru-minecraft"),
  mcPort: Number(optional("MC_PORT", "25565")),
  mcUsername: optional("MC_USERNAME", "Haru"),
  mcAuth: optional("MC_AUTH", "offline") as "offline" | "microsoft",

  /** 暴走ガード */
  sessionMaxMinutes: Number(optional("SESSION_MAX_MINUTES", "120")),
  sessionsPerDayMax: Number(optional("SESSIONS_PER_DAY_MAX", "2")),
  decisionIntervalMinMs: Number(optional("DECISION_INTERVAL_MIN_MS", "8000")),
  statusIntervalMs: Number(optional("STATUS_INTERVAL_MS", "30000")),
  sameFailureLimit: Number(optional("SAME_FAILURE_LIMIT", "4")),

  logDir: optional("HARU_MINECRAFT_LOG_DIR", "logs"),
} as const;

export { required };
