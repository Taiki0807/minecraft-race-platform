/**
 * (A) bridge → Creator Studio 管理画面。
 * ハル・マイクラ API仕様（連携契約）v1 (2026-11-07) の封筒・payload定義。
 */

export type SayKind = "goal" | "intent" | "reaction" | "reflex" | "idle";

export type SayPayload = { text: string; kind: SayKind };

export type GoalPayload = {
  goal_id: string;
  title: string;
  /** 0.0〜1.0 */
  progress: number;
  step: string;
};

export type EventKind =
  | "death"
  | "discovery"
  | "stuck"
  | "session_start"
  | "session_end"
  | "skill_learned";

export type GameEventPayload = { kind: EventKind; detail: string };

export type StatusPayload = {
  hp: number;
  food: number;
  position: { x: number; y: number; z: number };
  goal_title: string | null;
};

export type EventEnvelope =
  | { v: 1; id: string; ts: string; session_id: string; type: "say"; payload: SayPayload }
  | { v: 1; id: string; ts: string; session_id: string; type: "goal"; payload: GoalPayload }
  | { v: 1; id: string; ts: string; session_id: string; type: "event"; payload: GameEventPayload }
  | { v: 1; id: string; ts: string; session_id: string; type: "status"; payload: StatusPayload };

export type EventEnvelopeInput =
  | { type: "say"; payload: SayPayload }
  | { type: "goal"; payload: GoalPayload }
  | { type: "event"; payload: GameEventPayload }
  | { type: "status"; payload: StatusPayload };

/** brain の /control (管理画面 → brain)。 */
export type ControlCommand = "start" | "stop" | "pause" | "resume";

export type ControlRequest = { command: ControlCommand; session_note?: string };

export type BrainState = "idle" | "running" | "paused" | "stopping";

export type ControlResponse = { ok: true; state: BrainState };

export type StatusResponse = {
  online: true;
  state: BrainState;
  session_id: string | null;
  current_goal: string | null;
  last_event_at: string | null;
};
