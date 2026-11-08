import { describe, expect, it } from "vitest";
import { Watchdog } from "../src/watchdog.js";

describe("Watchdog", () => {
  it("continues while tool calls succeed", () => {
    const watchdog = new Watchdog(4, 120);
    expect(watchdog.recordToolResult("dig_block", true)).toBe("continue");
    expect(watchdog.recordToolResult("dig_block", true)).toBe("continue");
  });

  it("resets the failure streak on success", () => {
    const watchdog = new Watchdog(3, 120);
    watchdog.recordToolResult("dig_block", false);
    watchdog.recordToolResult("dig_block", false);
    expect(watchdog.recordToolResult("dig_block", true)).toBe("continue");
    expect(watchdog.recordToolResult("dig_block", false)).toBe("continue");
    expect(watchdog.recordToolResult("dig_block", false)).toBe("continue");
    expect(watchdog.recordToolResult("dig_block", false)).toBe("switch_task");
  });

  it("switches task on reaching the same-failure limit for one skill, then stops on the next limit hit", () => {
    const watchdog = new Watchdog(2, 120);
    expect(watchdog.recordToolResult("craft_item", false)).toBe("continue");
    expect(watchdog.recordToolResult("craft_item", false)).toBe("switch_task");

    expect(watchdog.recordToolResult("move_to", false)).toBe("continue");
    expect(watchdog.recordToolResult("move_to", false)).toBe("stop");
  });

  it("does not carry a failure streak across different skill names below the limit", () => {
    const watchdog = new Watchdog(3, 120);
    expect(watchdog.recordToolResult("dig_block", false)).toBe("continue");
    expect(watchdog.recordToolResult("craft_item", false)).toBe("continue");
    expect(watchdog.recordToolResult("craft_item", false)).toBe("continue");
  });

  it("reports session expiry based on elapsed minutes", () => {
    const start = 1_000_000;
    const watchdog = new Watchdog(4, 1, start);
    expect(watchdog.isSessionExpired(start + 30_000)).toBe(false);
    expect(watchdog.isSessionExpired(start + 61_000)).toBe(true);
  });
});
