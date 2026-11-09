import { describe, expect, it } from "vitest";
import type { Bot } from "mineflayer";
import { computeDangerJudgment, nearbyHostiles } from "../src/bot/danger.js";

function vec(x: number, y: number, z: number) {
  return {
    x,
    y,
    z,
    distanceTo(other: { x: number; y: number; z: number }) {
      return Math.sqrt((x - other.x) ** 2 + (y - other.y) ** 2 + (z - other.z) ** 2);
    },
  };
}

function fakeBot(health: number, entities: Record<string, unknown>): Bot {
  return {
    health,
    entity: { id: 1, position: vec(0, 64, 0) },
    entities,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("computeDangerJudgment", () => {
  it("returns null when no hostiles are nearby", () => {
    const bot = fakeBot(20, {
      "1": { id: 1, position: vec(0, 64, 0) },
      "2": { id: 2, name: "cow", kind: "Passive mobs", position: vec(2, 64, 2) },
    });
    expect(computeDangerJudgment(bot)).toBeNull();
  });

  it("recommends fighting with few healthy enemies and no creeper", () => {
    const bot = fakeBot(20, {
      "1": { id: 1, position: vec(0, 64, 0) },
      "2": { id: 2, name: "zombie", kind: "Hostile mobs", position: vec(2, 64, 2) },
    });
    const result = computeDangerJudgment(bot);
    expect(result?.shouldFlee).toBe(false);
    expect(result?.hostileCount).toBe(1);
    expect(result?.text).toContain("戦える");
  });

  it("recommends fleeing when 3 or more hostiles are nearby", () => {
    const bot = fakeBot(20, {
      "1": { id: 1, position: vec(0, 64, 0) },
      "2": { id: 2, name: "zombie", kind: "Hostile mobs", position: vec(1, 64, 1) },
      "3": { id: 3, name: "zombie", kind: "Hostile mobs", position: vec(2, 64, 2) },
      "4": { id: 4, name: "skeleton", kind: "Hostile mobs", position: vec(3, 64, 3) },
    });
    const result = computeDangerJudgment(bot);
    expect(result?.shouldFlee).toBe(true);
    expect(result?.hostileCount).toBe(3);
    expect(result?.text).toContain("逃げる");
    expect(result?.text).toContain("3体");
  });

  it("recommends fleeing when a creeper is nearby regardless of count", () => {
    const bot = fakeBot(20, {
      "1": { id: 1, position: vec(0, 64, 0) },
      "2": { id: 2, name: "creeper", kind: "Hostile mobs", position: vec(2, 64, 2) },
    });
    const result = computeDangerJudgment(bot);
    expect(result?.shouldFlee).toBe(true);
    expect(result?.hasCreeper).toBe(true);
  });

  it("recommends fleeing when HP is below 10 even against a single weak enemy", () => {
    const bot = fakeBot(8, {
      "1": { id: 1, position: vec(0, 64, 0) },
      "2": { id: 2, name: "zombie", kind: "Hostile mobs", position: vec(2, 64, 2) },
    });
    const result = computeDangerJudgment(bot);
    expect(result?.shouldFlee).toBe(true);
  });

  it("ignores hostiles outside the danger range", () => {
    const bot = fakeBot(20, {
      "1": { id: 1, position: vec(0, 64, 0) },
      "2": { id: 2, name: "zombie", kind: "Hostile mobs", position: vec(100, 64, 100) },
    });
    expect(computeDangerJudgment(bot)).toBeNull();
  });
});

describe("nearbyHostiles", () => {
  it("excludes the bot itself and non-hostile entities", () => {
    const bot = fakeBot(20, {
      "1": { id: 1, position: vec(0, 64, 0) },
      "2": { id: 2, name: "zombie", kind: "Hostile mobs", position: vec(2, 64, 2) },
      "3": { id: 3, name: "cow", kind: "Passive mobs", position: vec(3, 64, 3) },
    });
    const hostiles = nearbyHostiles(bot);
    expect(hostiles.map((h) => h.name)).toEqual(["zombie"]);
  });
});
