import { createSkillRegistry } from "../src/skills/index.js";

const registry = createSkillRegistry();
console.log(JSON.stringify(registry.listToolDefinitions(), null, 2));
