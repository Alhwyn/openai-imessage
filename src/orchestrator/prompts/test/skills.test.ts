import { describe, expect, test } from "bun:test";

import { interactionSystemPrompt } from "../index";
import {
  formatSkillCatalog,
  loadInteractionSkills,
} from "../skills";

describe("interaction skills", () => {
  test("loads skill frontmatter and catalogs each skill", async () => {
    const skills = await loadInteractionSkills();
    const names = skills.map((skill) => skill.name);

    expect(names).toEqual([
      "computer-use",
      "connected-apps",
      "email-writing",
      "image-generation",
      "location-discovery",
      "task-delegation",
    ]);
    expect(skills.every((skill) => skill.description.length > 0)).toBe(true);
    expect(skills.every((skill) => skill.body.length > 0)).toBe(true);

    const catalog = formatSkillCatalog(skills);
    expect(catalog).toContain("computer-use:");
    expect(catalog).toContain("connected-apps:");
  });

  test("assembles catalog and skill bodies into the system prompt", () => {
    expect(interactionSystemPrompt).toContain("<capabilities>");
    expect(interactionSystemPrompt).toContain("<skills>");
    expect(interactionSystemPrompt).toContain('<skill name="computer-use">');
    expect(interactionSystemPrompt).toContain('<skill name="connected-apps">');
    expect(interactionSystemPrompt).not.toContain("{{SKILL_CATALOG}}");
    expect(interactionSystemPrompt).not.toContain('<skill name="memory">');
  });
});
