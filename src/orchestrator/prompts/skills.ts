import { readdir } from "node:fs/promises";

export type InteractionSkill = {
  name: string;
  description: string;
  body: string;
};

const SKILLS_DIR = new URL("./skills/", import.meta.url);

/**
 * Parses YAML frontmatter name/description from a SKILL.md file.
 */
const parseSkillMarkdown = (raw: string, source: string): InteractionSkill => {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Invalid skill frontmatter in ${source}`);

  const frontmatter = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name) throw new Error(`Missing skill name in ${source}`);
  if (!description) throw new Error(`Missing skill description in ${source}`);

  return { name, description, body };
};

/**
 * Loads every skills/<name>/SKILL.md for the interaction agent.
 */
export const loadInteractionSkills = async (): Promise<InteractionSkill[]> => {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const skills: InteractionSkill[] = [];
  for (const dir of directories) {
    const fileUrl = new URL(`./${dir}/SKILL.md`, SKILLS_DIR);
    const raw = (await Bun.file(fileUrl).text()).trim();
    skills.push(parseSkillMarkdown(raw, `${dir}/SKILL.md`));
  }
  return skills;
};

/**
 * Builds the always-on skill catalog (name + description).
 */
export const formatSkillCatalog = (skills: InteractionSkill[]): string =>
  skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");

/**
 * Builds full skill instruction blocks for the system prompt.
 */
export const formatSkillBodies = (skills: InteractionSkill[]): string =>
  skills
    .map(
      (skill) =>
        `<skill name="${skill.name}">\n${skill.body}\n</skill>`,
    )
    .join("\n\n");
