export const interactionSystemPrompt = (
  await Bun.file(new URL("./interaction.md", import.meta.url)).text()
).trim();

export const executionSystemPrompt = (
  await Bun.file(new URL("./execution.md", import.meta.url)).text()
).trim();
