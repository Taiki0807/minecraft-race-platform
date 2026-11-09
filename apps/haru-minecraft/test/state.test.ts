import { describe, expect, it } from "vitest";
import type { Bot } from "mineflayer";
import { buildState } from "../src/bot/state.js";

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

function fakeBot(groundBlockName = "grass_block"): Bot {
  return {
    health: 18,
    food: 15,
    entity: { id: 1, position: vec(0, 64, 0) },
    time: { timeOfDay: 1000, isDay: true },
    inventory: { items: () => [{ name: "oak_log", count: 5 }] },
    entities: {
      "1": { id: 1, position: vec(0, 64, 0) },
      "2": { id: 2, name: "zombie", position: vec(3, 64, 4) },
      "3": { id: 3, username: "Steve", position: vec(10, 64, 10) },
    },
    blockAt: () => (groundBlockName ? { name: groundBlockName } : null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("buildState", () => {
  it("summarizes hp/food/position/time", () => {
    const state = buildState(fakeBot());
    expect(state.hp).toBe(18);
    expect(state.food).toBe(15);
    expect(state.position).toEqual({ x: 0, y: 64, z: 0 });
    expect(state.isDay).toBe(true);
  });

  it("lists inventory items", () => {
    const state = buildState(fakeBot());
    expect(state.inventory).toEqual([{ name: "oak_log", count: 5 }]);
  });

  it("excludes the bot's own entity and sorts others by distance", () => {
    const state = buildState(fakeBot());
    expect(state.nearbyEntities.map((e) => e.name)).toEqual(["zombie", "Steve"]);
    expect(state.nearbyEntities[0]?.distance).toBeLessThan(state.nearbyEntities[1]?.distance ?? Infinity);
  });

  it("reports the block directly underfoot as ground", () => {
    expect(buildState(fakeBot("oak_leaves")).ground).toBe("oak_leaves");
    expect(buildState(fakeBot("grass_block")).ground).toBe("grass_block");
  });

  it("falls back to 'unknown' when the block below hasn't loaded", () => {
    expect(buildState(fakeBot("")).ground).toBe("unknown");
  });
});
