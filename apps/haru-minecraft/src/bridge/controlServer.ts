import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { nowJstIso } from "../util/time.js";
import type { BrainState, ControlCommand, ControlRequest } from "./types.js";

export type ControlHandler = (command: ControlCommand, sessionNote?: string) => void;

/**
 * 逆方向(管理画面 → brain)。brain 自身が小さなHTTPサーバーを持つ。
 *   POST /control  { command, session_note? } -> { ok:true, state }
 *   GET  /status   -> { online, state, session_id, current_goal, last_event_at }
 */
export class ControlServer {
  private server: Server | null = null;
  private state: BrainState = "idle";
  private sessionId: string | null = null;
  private currentGoal: string | null = null;
  private lastEventAt: string | null = null;

  constructor(
    private readonly port: number,
    private readonly token: string,
    private readonly onCommand: ControlHandler
  ) {}

  setState(state: BrainState): void {
    this.state = state;
  }

  setSession(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  setCurrentGoal(goalTitle: string | null): void {
    this.currentGoal = goalTitle;
  }

  touchLastEvent(): void {
    this.lastEventAt = nowJstIso();
  }

  private authorized(req: IncomingMessage): boolean {
    if (!this.token) return true; // ローカル開発ではトークン未設定を許容する。
    const header = req.headers.authorization ?? "";
    return header === `Bearer ${this.token}`;
  }

  private async readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return {};
    return JSON.parse(raw);
  }

  private writeJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  start(): void {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server.listen(this.port);
  }

  stop(): void {
    this.server?.close();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.authorized(req)) {
      this.writeJson(res, 401, { error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && req.url === "/status") {
      this.writeJson(res, 200, {
        online: true,
        state: this.state,
        session_id: this.sessionId,
        current_goal: this.currentGoal,
        last_event_at: this.lastEventAt,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/control") {
      let body: unknown;
      try {
        body = await this.readJsonBody(req);
      } catch {
        this.writeJson(res, 400, { error: "invalid json" });
        return;
      }

      const parsed = parseControlRequest(body);
      if (!parsed) {
        this.writeJson(res, 400, { error: "invalid command" });
        return;
      }

      this.onCommand(parsed.command, parsed.session_note);
      this.writeJson(res, 200, { ok: true, state: this.state });
      return;
    }

    this.writeJson(res, 404, { error: "not found" });
  }
}

const COMMANDS: ControlCommand[] = ["start", "stop", "pause", "resume"];

export function parseControlRequest(body: unknown): ControlRequest | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const command = record.command;
  if (typeof command !== "string" || !COMMANDS.includes(command as ControlCommand)) return null;
  const sessionNote = record.session_note;
  if (sessionNote !== undefined && typeof sessionNote !== "string") return null;
  return { command: command as ControlCommand, session_note: sessionNote };
}
