import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { nowJstIso } from "../util/time.js";

/**
 * 「全プロセスは判断・ツール呼び出し・結果・発話をJSONLログに残す」の実装。
 * 1行1JSON。後から再生・検証できることが受け入れ条件なので、
 * 失敗しても例外は投げず(ログ書き込みでプロセスを止めない)、stderrにだけ出す。
 */
export type LogKind =
  | "decision" // LLMの判断(tool_calls/text)
  | "tool_call" // スキル呼び出しの開始
  | "tool_result" // スキル呼び出しの結果
  | "speak" // 発話(say)
  | "bridge_send" // (A)への送信結果
  | "error" // 形式エラー・例外
  | "watchdog" // ループ検知・セッション制御
  | "info";

export type LogEntry = {
  ts: string;
  session_id: string | null;
  kind: LogKind;
  [key: string]: unknown;
};

export class JsonlLogger {
  private filePath: string;
  private ready: Promise<void>;

  constructor(logDir: string, sessionId: string) {
    const fileName = `${sessionId}.jsonl`;
    this.filePath = path.join(logDir, fileName);
    this.ready = mkdir(logDir, { recursive: true }).then(() => undefined);
  }

  async log(kind: LogKind, sessionId: string | null, fields: Record<string, unknown> = {}): Promise<void> {
    const entry: LogEntry = { ts: nowJstIso(), session_id: sessionId, kind, ...fields };
    try {
      await this.ready;
      await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (error) {
      // ログ書き込みの失敗でループを止めない。標準エラーにだけ残す。
      console.error("[haru-minecraft] ログ書き込みに失敗しました", error);
    }
  }
}
