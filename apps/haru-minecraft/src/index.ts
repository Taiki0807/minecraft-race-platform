import { config } from "./config.js";
import { JsonlLogger } from "./logging/jsonl.js";
import { openDatabase } from "./memory/db.js";
import * as repo from "./memory/repository.js";
import { generateEmbedding, type EmbeddingConfig } from "./memory/embeddings.js";
import { classifyToolEpisode, formatSkillHints, runReflectionPass, skillKeyFor } from "./memory/reflect.js";
import { BridgeClient } from "./bridge/client.js";
import { ControlServer } from "./bridge/controlServer.js";
import { createMinecraftBot } from "./bot/createBot.js";
import { buildState } from "./bot/state.js";
import { createSkillRegistry } from "./skills/index.js";
import { OllamaProvider } from "./brain/adapters/ollama.js";
import { HomeLlmProvider } from "./brain/adapters/homeLlm.js";
import { buildSystemPrompt } from "./brain/promptBuilder.js";
import { runJudgmentCycle } from "./brain/loop.js";
import { Watchdog } from "./watchdog.js";
import type { ChatMessage } from "./brain/llmProvider.js";
import { nowJstIso } from "./util/time.js";

/**
 * (A)(B)(C)(D) をまとめて起動するエントリポイント。
 *
 * Mineflayer本体(C)・判断ループ(B)・記憶(D)・Creator Studio連携(A)を全部1プロセスで
 * 持つ(Proxmox上、haru_workerで常駐させる想定)。GPUが必要なLLM/embeddingだけ
 * Windows側のサービスにHTTP越しで依頼し、Creator StudioへもHTTP越しに発話・イベントを送る
 * — ここだけが実際の外部API呼び出しで、Minecraft操作自体は同プロセス内で直接行う。
 *
 * Haruの人格プロンプト本体はCreator Studio側の既存機能であり、ここで複製しない。
 * HARU_PERSONA_PROMPT で注入する(未設定時は最低限のフォールバックのみ)。
 */
const PERSONA_PROMPT =
  process.env.HARU_PERSONA_PROMPT ??
  "あなたは「ハル」というVTuberです。気だるげな独り言調で、ゲーム内の出来事に一人称で反応してください。";

const MAX_HISTORY_MESSAGES = 40;
const SKILL_SEARCH_TOP_K = 3;

const embeddingConfig: EmbeddingConfig = {
  provider: config.embeddingProvider,
  ollamaBaseUrl: config.ollamaBaseUrl,
  ollamaModel: config.embeddingModel,
  ollamaToken: config.ollamaToken,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const db = openDatabase(config.dbPath);
  const llm =
    config.llmProvider === "ollama"
      ? new OllamaProvider(config.ollamaBaseUrl, config.ollamaModel, config.llmTimeoutMs, config.ollamaToken)
      : new HomeLlmProvider(config.homeLlmBaseUrl, config.homeLlmToken, config.llmTimeoutMs);

  const registry = createSkillRegistry();
  const bot = createMinecraftBot({
    host: config.mcHost,
    port: config.mcPort,
    username: config.mcUsername,
    auth: config.mcAuth,
  });

  let sessionId: string | null = null;
  let logger: JsonlLogger | null = null;
  let bridge: BridgeClient | null = null;
  let watchdog: Watchdog | null = null;
  let running = false;
  let paused = false;
  let currentGoal: string | null = null;
  const history: ChatMessage[] = [];

  // (D) 世界の知識: 出現地点は毎回スポーンのたびに上書きする(セッションに依存しない)。
  bot.on("spawn", () => {
    const position = bot.entity.position;
    repo.addWorldFact(db, { kind: "base", key: "spawn", value: { x: position.x, y: position.y, z: position.z } });
  });

  // (D) 死亡はエピソードとして残し、(A) にも通知する。
  bot.on("death", () => {
    if (sessionId) {
      repo.recordEpisode(db, { sessionId, kind: "death", summary: "死亡した" });
    }
    if (bridge) {
      void bridge.sendEvent({ type: "event", payload: { kind: "death", detail: "死亡した" } });
    }
  });

  const control = new ControlServer(config.brainPort, config.brainToken, (command, sessionNote) => {
    if (command === "start" && !running) {
      const todayJst = nowJstIso().slice(0, 10);
      if (repo.countSessionsStartedOn(db, todayJst) >= config.sessionsPerDayMax) {
        console.warn(
          `[haru-minecraft] 本日のセッション上限(${config.sessionsPerDayMax})に達しているため開始しない`
        );
        return;
      }
      running = true;
      paused = false;
      void startSession(sessionNote);
    } else if (command === "stop" && running) {
      running = false;
      void stopSession(sessionNote ?? "stop_requested");
    } else if (command === "pause" && running && !paused) {
      paused = true;
      control.setState("paused");
    } else if (command === "resume" && running && paused) {
      paused = false;
      control.setState("running");
    }
  });

  async function startSession(goalTitle?: string): Promise<void> {
    const id = repo.startSession(db, goalTitle);
    sessionId = id;
    currentGoal = goalTitle ?? null;
    logger = new JsonlLogger(config.logDir, id);
    bridge = new BridgeClient(config.studioBaseUrl, config.studioToken, id, logger);
    watchdog = new Watchdog(config.sameFailureLimit, config.sessionMaxMinutes);
    history.length = 0;

    control.setSession(id);
    control.setCurrentGoal(currentGoal);
    control.setState("running");

    await bridge.sendEvent({
      type: "event",
      payload: { kind: "session_start", detail: goalTitle ?? "" },
    });

    void runLoop();
  }

  async function stopSession(note: string): Promise<void> {
    if (!sessionId || !bridge || !logger) return;
    control.setState("stopping");
    await bridge.sendEvent({ type: "event", payload: { kind: "session_end", detail: note } });

    const finishedSessionId = sessionId;
    const rule = await runReflectionPass(llm, db, finishedSessionId).catch((error) => {
      console.error("[haru-minecraft] 振り返りに失敗した", error);
      return null;
    });
    if (rule) {
      await logger.log("info", finishedSessionId, { reflection_rule: rule });
    }

    repo.endSession(db, finishedSessionId, note);
    control.setSession(null);
    control.setCurrentGoal(null);
    control.setState("idle");
    sessionId = null;
    currentGoal = null;
    logger = null;
    bridge = null;
    watchdog = null;
  }

  async function recordAndLearnFromTool(
    activeSessionId: string,
    name: string,
    args: Record<string, unknown>,
    result: { ok: boolean; message: string }
  ): Promise<void> {
    const classification = classifyToolEpisode(name, args, result);
    if (classification) {
      repo.recordEpisode(db, {
        sessionId: activeSessionId,
        kind: classification.kind,
        summary: classification.summary,
      });
    }

    if (result.ok && classification?.kind === "achievement") {
      const key = skillKeyFor(name, args);
      const embedding = await generateEmbedding(`${name} ${JSON.stringify(args)}`, embeddingConfig);
      repo.upsertSkill(db, {
        name: key,
        description: result.message,
        steps: [{ name, args }],
        embedding,
        incrementSuccess: true,
      });
    }
  }

  async function runLoop(): Promise<void> {
    while (running && sessionId && bridge && logger && watchdog) {
      if (paused) {
        await sleep(1_000);
        continue;
      }

      if (watchdog.isSessionExpired()) {
        await stopSession("session_max_minutes_reached");
        break;
      }

      // bot未spawn・LLM到達不能など、1サイクル分の判断・実行で起きる想定外の例外は
      // ここで必ず捕まえる。何もしないとプロセス全体がunhandled rejectionで落ちるため
      // (このループは void runLoop() で開始され、誰も await/catchしていない)。
      let shouldStop = false;
      try {
        const state = buildState(bot);
        const rules = repo.getActiveRules(db);

        // (D) RAG検索: 現在の目標に近い過去の成功パターンをヒントとしてプロンプトへ混ぜる。
        const queryEmbedding = await generateEmbedding(currentGoal ?? "マイクラでの行動", embeddingConfig);
        const skillHints = formatSkillHints(repo.searchSkills(db, queryEmbedding, SKILL_SEARCH_TOP_K));

        const system = buildSystemPrompt(PERSONA_PROMPT, state, rules, skillHints);

        history.push({ role: "user", content: JSON.stringify({ state }) });

        const result = await runJudgmentCycle({
          llm,
          registry,
          bot,
          system,
          history,
          maxTokens: 512,
          bridge,
          logger,
          sessionId,
        });

        if (result.text) {
          history.push({ role: "assistant", content: result.text });
        }

        for (const executed of result.executed) {
          history.push({
            role: "tool",
            content: `${executed.name}: ${executed.result.ok ? "ok" : "failed"} - ${executed.result.message}`,
          });

          await recordAndLearnFromTool(sessionId, executed.name, executed.args, executed.result);

          const decision = watchdog.recordToolResult(executed.name, executed.result.ok);
          if (decision === "switch_task") {
            await logger.log("watchdog", sessionId, { decision, name: executed.name });
          } else if (decision === "stop") {
            await logger.log("watchdog", sessionId, { decision, name: executed.name });
            await bridge.sendEvent({
              type: "event",
              payload: { kind: "stuck", detail: `${executed.name} が繰り返し失敗したため停止した` },
            });
            shouldStop = true;
            break;
          }
        }

        if (history.length > MAX_HISTORY_MESSAGES) {
          history.splice(0, history.length - MAX_HISTORY_MESSAGES);
        }
      } catch (error) {
        await logger.log("error", sessionId, {
          phase: "judgment_cycle",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (shouldStop) {
        await stopSession("watchdog_stop");
        break;
      }

      await sleep(config.decisionIntervalMinMs);
    }
  }

  setInterval(() => {
    if (!sessionId || !bridge) return;
    try {
      const state = buildState(bot);
      void bridge.sendEvent({
        type: "status",
        payload: { hp: state.hp, food: state.food, position: state.position, goal_title: currentGoal },
      });
      control.touchLastEvent();
    } catch (error) {
      // bot未spawn等。ここで落とすとプロセス全体が死ぬので、ログだけ残して次の間隔を待つ。
      void logger?.log("error", sessionId, {
        phase: "status_report",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, config.statusIntervalMs);

  control.start();
  console.log(`[haru-minecraft] control server listening on :${config.brainPort} (${nowJstIso()})`);
}

// 最後の安全網: ここまでの個別のtry/catchで想定していない例外が漏れても、
// Node既定の「unhandled rejection/exceptionでプロセス終了」は避ける
// (常時稼働させる前提のプロセスなので、ログに残して動き続ける方を優先する)。
process.on("unhandledRejection", (reason) => {
  console.error("[haru-minecraft] unhandledRejection", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[haru-minecraft] uncaughtException", error);
});

main().catch((error) => {
  console.error("[haru-minecraft] 起動に失敗した", error);
  process.exit(1);
});
