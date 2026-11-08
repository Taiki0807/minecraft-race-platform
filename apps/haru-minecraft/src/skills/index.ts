import { SkillRegistry } from "./registry.js";
import { collectSkill } from "./definitions/collect.js";
import { craftItemSkill } from "./definitions/craftItem.js";
import { depositToChestSkill } from "./definitions/depositToChest.js";
import { digBlockSkill } from "./definitions/digBlock.js";
import { eatSkill } from "./definitions/eat.js";
import { equipSkill } from "./definitions/equip.js";
import { findBlocksSkill } from "./definitions/findBlocks.js";
import { getStateSkill } from "./definitions/getState.js";
import { moveToSkill } from "./definitions/moveTo.js";
import { placeBlockSkill } from "./definitions/placeBlock.js";
import { speakSkill } from "./definitions/speak.js";
import { waitSkill } from "./definitions/wait.js";
import { withdrawFromChestSkill } from "./definitions/withdrawFromChest.js";

/** (C) に列挙された全スキルを登録済みの SkillRegistry を作る。 */
export function createSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  for (const skill of [
    speakSkill,
    getStateSkill,
    moveToSkill,
    findBlocksSkill,
    digBlockSkill,
    placeBlockSkill,
    collectSkill,
    craftItemSkill,
    equipSkill,
    eatSkill,
    depositToChestSkill,
    withdrawFromChestSkill,
    waitSkill,
  ]) {
    registry.register(skill);
  }
  return registry;
}

export { SkillRegistry } from "./registry.js";
export type { Skill, SkillContext, SkillResult, ToolDefinition } from "./types.js";
