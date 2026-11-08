import { randomUUID } from "node:crypto";
import { nowJstIso } from "../util/time.js";
import type { JsonlLogger } from "../logging/jsonl.js";
import type { EventEnvelope, EventEnvelopeInput } from "./types.js";

/**
 * (A) bridge → Creator Studio 管理画面。POST {STUDIO_BASE_URL}/api/minecraft/events
 *
 * 仕様の通り「失敗してもリトライしない。ログに残すだけ」。管理画面が落ちていても
 * ゲーム内の判断ループは止めない — だからこのクライアントは例外を外に投げない。
 */
export class BridgeClient {
  constructor(
    private readonly studioBaseUrl: string,
    private readonly studioToken: string,
    private readonly sessionId: string,
    private readonly logger: JsonlLogger
  ) {}

  async sendEvent(input: EventEnvelopeInput): Promise<void> {
    const envelope: EventEnvelope = {
      v: 1,
      id: randomUUID(),
      ts: nowJstIso(),
      session_id: this.sessionId,
      ...input,
    } as EventEnvelope;

    try {
      const response = await fetch(`${this.studioBaseUrl.replace(/\/+$/, "")}/api/minecraft/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.studioToken ? { Authorization: `Bearer ${this.studioToken}` } : {}),
        },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(5_000),
      });
      await this.logger.log("bridge_send", this.sessionId, {
        type: envelope.type,
        status: response.status,
        ok: response.ok,
      });
    } catch (error) {
      // 送信失敗はリトライしない。ログだけ残して処理を続ける。
      await this.logger.log("bridge_send", this.sessionId, {
        type: envelope.type,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
