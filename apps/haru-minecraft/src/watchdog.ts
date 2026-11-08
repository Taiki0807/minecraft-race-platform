/**
 * ループ・同一失敗の検知とセッション時間制限。
 * Voyager参考: 「4回失敗→タスク切り替え、それでも失敗→停止+通知」の二段階。
 */
export type WatchdogDecision = "continue" | "switch_task" | "stop";

export class Watchdog {
  private failureStreak = 0;
  private lastFailureName: string | null = null;
  private hasAlreadySwitched = false;
  private readonly sessionStartedAtMs: number;

  constructor(
    private readonly sameFailureLimit: number,
    private readonly sessionMaxMinutes: number,
    now: number = Date.now()
  ) {
    this.sessionStartedAtMs = now;
  }

  /** ツール実行結果を1件記録し、取るべき対応を返す。 */
  recordToolResult(name: string, ok: boolean): WatchdogDecision {
    if (ok) {
      this.failureStreak = 0;
      this.lastFailureName = null;
      this.hasAlreadySwitched = false;
      return "continue";
    }

    if (this.lastFailureName === name) {
      this.failureStreak += 1;
    } else {
      this.failureStreak = 1;
      this.lastFailureName = name;
    }

    if (this.failureStreak >= this.sameFailureLimit) {
      if (this.hasAlreadySwitched) {
        return "stop";
      }
      this.hasAlreadySwitched = true;
      this.failureStreak = 0;
      return "switch_task";
    }

    return "continue";
  }

  isSessionExpired(now: number = Date.now()): boolean {
    return now - this.sessionStartedAtMs >= this.sessionMaxMinutes * 60 * 1000;
  }
}
