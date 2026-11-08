import { describe, expect, it } from "vitest";
import { parseControlRequest } from "../src/bridge/controlServer.js";

describe("parseControlRequest", () => {
  it("accepts each valid command", () => {
    for (const command of ["start", "stop", "pause", "resume"]) {
      expect(parseControlRequest({ command })).toEqual({ command, session_note: undefined });
    }
  });

  it("accepts an optional session_note", () => {
    expect(parseControlRequest({ command: "stop", session_note: "緊急停止" })).toEqual({
      command: "stop",
      session_note: "緊急停止",
    });
  });

  it("rejects an unknown command", () => {
    expect(parseControlRequest({ command: "destroy" })).toBeNull();
  });

  it("rejects a non-string session_note", () => {
    expect(parseControlRequest({ command: "start", session_note: 123 })).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseControlRequest(null)).toBeNull();
    expect(parseControlRequest("start")).toBeNull();
    expect(parseControlRequest({})).toBeNull();
  });
});
