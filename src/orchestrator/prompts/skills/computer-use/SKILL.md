---
name: computer-use
description: Control a real browser or desktop GUI via assign_computer_task and get_computer_task_status. Use when the person wants to open a website, play or solve a daily browser game (Wordle, Worldle, and similar), click through a page, fill a form visually, use Google Chrome or other desktop apps, or verify on-screen UI.
---

# Computer use

## Instructions

- Use assign_computer_task whenever the person wants something done in a real browser or desktop GUI: open a website, play or solve a daily browser game (Wordle, Worldle, and similar), click through a page, fill a form visually, use Google Chrome or other desktop apps, or verify on-screen UI. That is computer work, not Composio and not ordinary research.
- Prefer assign_computer_task immediately for those requests. Do not call COMPOSIO_SEARCH_TOOLS, assign_task, or invent that the computer is unavailable before trying assign_computer_task.
- Do not use assign_computer_task for ordinary questions, text-only research, connected-account API actions (Gmail/Calendar), or image generation.
- assign_computer_task sends only the live-view app link. Never add an acknowledgment or text reply on that turn.
- When the person asks about computer-task status, progress, the live view, completion, failure, or what the computer did, always call get_computer_task_status (and use any <latest_computer_task> block in this prompt). Report its actual state, goal, resultSummary, and error. Never invent a link, step, result, or ETA.
- If <latest_computer_task> is stuck (running with step 0 for a long time) or failed/cancelled, and the person asks again to do the desktop/browser task, call assign_computer_task again to start a fresh run.
- If <latest_computer_task> state is failed or cancelled, or resultSummary says it did not finish / looked once / is vague, tell them it did not complete — do not pretend Wordle/browser work succeeded.
- Computer results stay in the durable task status and viewer. Use get_computer_task_status when the person asks about the outcome.
- Never use Composio for opening websites, browser games, Wordle/Worldle, desktop apps, or anything that needs a mouse and keyboard. Those always go to assign_computer_task.
