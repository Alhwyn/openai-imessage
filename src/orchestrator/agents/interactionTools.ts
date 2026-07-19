import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  assignComputerTask,
  assignImageTask,
  assignTask,
  getComputerTaskStatus,
  getImageTaskStatus,
} from "../handoff/index";
import { isComposioAuthUrl } from "../integrations/index";
import { editMemory } from "../memory/index";
import { TAPBACK_KEYS } from "../tapbacks";
import {
  GMI_IMAGE_MAX_COUNT,
  GMI_IMAGE_MIN_COUNT,
} from "../utils/index";

import type { TurnEffectCollector } from "./turnEffects";
import type { InteractionEvent } from "./types";
import type { DeliveryTarget } from "../handoff/types";

type BuildInteractionToolsInput = {
  composioTools: ToolSet;
  deliveryTarget: DeliveryTarget;
  effects: TurnEffectCollector;
  event: InteractionEvent;
  spaceId: string;
};

export const buildInteractionTools = ({
  composioTools,
  deliveryTarget,
  effects,
  event,
  spaceId,
}: BuildInteractionToolsInput): ToolSet => {
  const firstPartyTools = {
    assign_task: tool({
      description:
        "Assign a task to an execution sub-agent with the sender's Composio tools. Returns immediately with a taskId; the worker delivers its result directly when finished. Do not use this for image generation.",
      inputSchema: z.object({
        task: z.string().describe("Clear task instructions for the worker"),
      }),
      execute: ({ task }) => {
        const { taskId, status } = assignTask({
          deliveryTarget,
          spaceId,
          senderId: event.senderId,
          task,
          images: event.images,
        });
        return { taskId, status };
      },
    }),
    assign_computer_task: tool({
      description:
        "Assign work on the local Linux desktop with mouse and keyboard: open Google Chrome/websites, play or solve browser games (Wordle, Worldle/worlds, etc.), click through pages, use GUI apps, or verify on-screen UI. Use this instead of Composio for any browser/desktop work. Returns immediately while the computer worker continues in the background. Do not use for Gmail/Calendar APIs, ordinary research, or image generation.",
      inputSchema: z.object({
        goal: z.string().min(1).describe("Clear, bounded goal for the Linux computer worker"),
      }),
      execute: async ({ goal }) => {
        const result = await assignComputerTask({
          deliveryTarget,
          spaceId,
          goal,
        });
        effects.push({
          kind: "text",
          text: `starting the computer now — watch it live:\n${result.liveViewUrl}`,
        });
        if (/^https?:\/\//.test(result.liveViewUrl)) {
          effects.push({ kind: "app", url: result.liveViewUrl });
        }
        return result;
      },
    }),
    get_computer_task_status: tool({
      description:
        "Get durable status for the latest Linux computer-use task in this conversation, including its current phase, step, last action, live viewer URL, completion result, or error.",
      inputSchema: z.object({}),
      execute: async () => {
        return (
          (await getComputerTaskStatus(spaceId)) ?? {
            state: "not_found" as const,
          }
        );
      },
    }),
    assign_image_task: tool({
      description:
        "Generate images with the image sub-agent. Pass one prompt per image. Immediately queues a natural acknowledgment with an ETA; when ready the images are delivered as an album directly. Do not send another reply on that turn.",
      inputSchema: z.object({
        prompts: z
          .array(z.string().min(1))
          .min(GMI_IMAGE_MIN_COUNT)
          .max(GMI_IMAGE_MAX_COUNT)
          .describe(
            'One prompt per image. Default shape: ["subject"]. For three cat pics use ["a cat", "a cat", "a cat"]. Vary entries when they want different images.',
          ),
      }),
      execute: ({ prompts }) => {
        console.log("[agent] Image request", {
          spaceId,
          count: prompts.length,
          prompts,
        });
        const { taskId, status, estimatedSeconds, acknowledgment } =
          assignImageTask({
            deliveryTarget,
            spaceId,
            prompts,
          });
        effects.push({ kind: "text", text: acknowledgment });
        return { taskId, status, estimatedSeconds };
      },
    }),
    get_image_task_status: tool({
      description:
        "Get real progress for the latest image-generation task in this conversation. Use whenever the person asks for image status, progress, completion count, or ETA.",
      inputSchema: z.object({}),
      execute: () => {
        const progress = getImageTaskStatus(spaceId);
        return progress ?? { state: "not_found" as const };
      },
    }),
    react_to_message: tool({
      description:
        "Tapback on their latest message (love/like/dislike/laugh/emphasize/question). Use when they want a reaction only, or call this before your text reply when they want both.",
      inputSchema: z.object({
        emoji: z.enum(TAPBACK_KEYS).describe("Tapback key"),
      }),
      execute: ({ emoji }) => {
        effects.push({ kind: "reaction", emoji });
        return { ok: true };
      },
    }),
    send_auth_link: tool({
      description:
        "Send a Composio OAuth authorization URL as a native deep-link app message. Call this whenever a Composio connection tool returns an authorization or redirect URL. Do not put that URL in chat text or Markdown.",
      inputSchema: z.object({
        url: z
          .string()
          .describe("HTTPS Composio authorization URL from a connection tool"),
      }),
      execute: ({ url }) => {
        const trimmed = url.trim();
        if (!isComposioAuthUrl(trimmed)) {
          return {
            ok: false,
            error:
              "url must be an https Composio authorization link (connect.composio.dev)",
          };
        }
        effects.push({ kind: "app", url: trimmed });
        return { ok: true };
      },
    }),
    memory: tool({
      description:
        "Update persistent memory. Use kind=user for the person's preferences/profile; kind=agent for lasting notes and conventions. Do not store secrets.",
      inputSchema: z.discriminatedUnion("action", [
        z.object({
          kind: z.enum(["user", "agent"]).describe("Which memory file to edit"),
          action: z.literal("add"),
          text: z.string().describe("New text to append"),
        }),
        z.object({
          kind: z.enum(["user", "agent"]).describe("Which memory file to edit"),
          action: z.literal("replace"),
          text: z.string().describe("Replacement text"),
          old_text: z.string().describe("Substring to find"),
        }),
        z.object({
          kind: z.enum(["user", "agent"]).describe("Which memory file to edit"),
          action: z.literal("remove"),
          old_text: z.string().describe("Substring to remove"),
        }),
      ]),
      execute: async (input) => {
        const updated =
          input.action === "add"
            ? await editMemory({
                spaceId,
                kind: input.kind,
                action: "add",
                text: input.text,
              })
            : input.action === "replace"
              ? await editMemory({
                  spaceId,
                  kind: input.kind,
                  action: "replace",
                  text: input.text,
                  oldText: input.old_text,
                })
              : await editMemory({
                  spaceId,
                  kind: input.kind,
                  action: "remove",
                  oldText: input.old_text,
                });
        return {
          ok: true,
          kind: updated.kind,
          body: updated.body,
          updatedAt: updated.updatedAt,
        };
      },
    }),
  } satisfies ToolSet;

  const safeComposioTools: ToolSet = {};
  for (const [name, composioTool] of Object.entries(composioTools)) {
    if (name in firstPartyTools) {
      console.error(`[composio] Ignoring tool name collision: ${name}`);
      continue;
    }
    safeComposioTools[name] = composioTool;
  }

  return { ...safeComposioTools, ...firstPartyTools };
};
