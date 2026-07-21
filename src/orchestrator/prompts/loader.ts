import {
  formatSkillBodies,
  formatSkillCatalog,
  loadInteractionSkills,
} from "./skills";

const skills = await loadInteractionSkills();
const skillCatalog = formatSkillCatalog(skills);
const skillBodies = formatSkillBodies(skills);

const interactionCore = (
  await Bun.file(new URL("./interaction.md", import.meta.url)).text()
)
  .trim()
  .replace("{{SKILL_CATALOG}}", skillCatalog);

export const interactionSystemPrompt = [
  interactionCore,
  "<skills>",
  skillBodies,
  "</skills>",
].join("\n\n");

export const executionSystemPrompt = (
  await Bun.file(new URL("./execution.md", import.meta.url)).text()
).trim();
