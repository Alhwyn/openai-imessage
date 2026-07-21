import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { searchNearbyPlaces } from "../exa/index";
import {
  assignBackgroundTask,
  assignComputerTask,
  assignImageTask,
  assignTask,
  getComputerTaskStatus,
  getImageTaskStatus,
} from "../handoff/index";
import { isComposioAuthUrl } from "../integrations/index";
import { createDirectionsLink } from "../maps";
import { editMemory } from "../memory/index";
import { TAPBACK_KEYS } from "../tapbacks";
import {
  IMAGE_MAX_COUNT,
  IMAGE_MIN_COUNT,
  toBackgroundJpeg,
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
        "Assign work on the local Linux desktop with mouse and keyboard: open Google Chrome/websites, play or solve browser games (Wordle, Worldle/worlds, etc.), click through pages, use GUI apps, or verify on-screen UI. Use this instead of Composio for any browser/desktop work. Returns immediately while the computer worker continues in the background and sends only a live-view app card, never chat text. Do not use for Gmail/Calendar APIs, ordinary research, or image generation.",
      inputSchema: z.object({
        goal: z.string().min(1).describe("Clear, bounded goal for the Linux computer worker"),
      }),
      execute: async ({ goal }) => {
        const result = await assignComputerTask({
          deliveryTarget,
          spaceId,
          goal,
        });
        if (result.viewerPageUrl) {
          effects.setTextPolicy("non_text_only");
          effects.push({
            kind: "app",
            presentation: "computer",
            url: result.viewerPageUrl,
          });
        }
        return result;
      },
    }),
    get_computer_task_status: tool({
      description:
        "Get durable status for a Linux computer-use task in this conversation, including its current phase, step, last action, live viewer URL, completion result, or error. Pass taskId when asking about a specific assignment; omit it for the latest task.",
      inputSchema: z.object({
        taskId: z
          .string()
          .optional()
          .describe("Task ID returned by assign_computer_task"),
      }),
      execute: async ({ taskId }) => {
        return (
          (await getComputerTaskStatus(spaceId, taskId)) ?? {
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
          .min(IMAGE_MIN_COUNT)
          .max(IMAGE_MAX_COUNT)
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
        // Tool ack is the only user-facing text; drop model commentary/planning.
        effects.setTextPolicy("tools_only");
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
      }
    }),
    set_chat_background: tool({
      description:
        "Set or clear this iMessage chat wallpaper. Use source=prompt to generate one, source=attachment for an image they just sent, or source=clear to remove it. Not for sending pics — use assign_image_task for that.",
      inputSchema: z.discriminatedUnion("source", [
        z.object({
          source: z.literal("prompt"),
          prompt: z.string().min(1).describe("Wallpaper image prompt"),
        }),
        z.object({ source: z.literal("attachment") }),
        z.object({ source: z.literal("clear") }),
      ]),
      execute: async (input) => {
        if (input.source === "clear") {
          effects.push({ kind: "background" });
          return { ok: true };
        }

        if (input.source === "prompt") {
          const { taskId, status, acknowledgment } = assignBackgroundTask({
            deliveryTarget,
            spaceId,
            prompt: input.prompt,
          });
          effects.setTextPolicy("tools_only");
          effects.push({ kind: "text", text: acknowledgment });
          return { taskId, status };
        }

        const image = event.images?.[0];
        if (!image) return {
          ok: false,
          error: "No image attachment on this message; ask them to send one",
        };

        try {
          effects.push({
            kind: "background",
            image: await toBackgroundJpeg(image.data),
          });
        } catch {
          return {
            ok: false,
            error: "Couldn't use that attachment as a wallpaper; send a real image (PNG, JPEG, or WebP)",
          };
        }
        return { ok: true };
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
        if (!isComposioAuthUrl(trimmed)) return {
          ok: false,
          error:
              "url must be an https Composio authorization link (connect.composio.dev)",
        };

        effects.push({ kind: "app", url: trimmed });
        return { ok: true };
      },
    }),
    search_nearby_places: tool({
      description:
        "Search Exa for evidence-backed places near a coarse area. Use a specific natural-language subject (full phrase, not keywords). Pass a city/neighborhood or place area they named. If results are thin, call again with a differently phrased subject. Use only returned results as evidence, but never show their source URLs in chat. Do not pass coordinates.",
      inputSchema: z.object({
        subject: z
          .string()
          .min(1)
          .describe(
            'Specific natural-language ask, e.g. "parks with peacocks", "off-leash dog parks", "best tacos"',
          ),
        searchArea: z
          .string()
          .min(1)
          .describe(
            'Coarse area only, e.g. "Victoria, BC". Never lat/lng.',
          ),
      }),
      execute: async ({ subject, searchArea }) => {
        return await searchNearbyPlaces({ subject, searchArea });
      },
    }),
    create_directions_link: tool({
      description:
        "Send the custom Spectrum maps mini-app card for an evidence-backed place. Call only after search_nearby_places (or again when they ask for directions / where they are to that place). Pass a destination name from those results plus the same coarse searchArea. Live blue-dot and route stay inside that card only — never describe the person's location in chat. This tool may also send a Find My request card. Never invent destinations. Never pass coordinates.",
      inputSchema: z.object({
        destination: z
          .string()
          .min(1)
          .describe(
            'Place name from search_nearby_places evidence, e.g. "Beacon Hill Park"',
          ),
        searchArea: z
          .string()
          .min(1)
          .describe(
            'Same coarse area used for search_nearby_places, e.g. "Victoria, BC". Never lat/lng.',
          ),
      }),
      execute: async ({ destination, searchArea }) => {
        const result = await createDirectionsLink({
          destination,
          searchArea,
          space: deliveryTarget.space,
          message: deliveryTarget.message,
          senderId: event.senderId,
        });
        if (result.status !== "ok") return {
          ok: false as const,
          error: result.error,
        };

        effects.push({
          kind: "app",
          presentation: "maps",
          url: result.url,
        });
        return {
          ok: true as const,
          destination: result.destination,
          searchArea: result.searchArea,
          // Opaque status only — never expose coordinates to the model.
          locationStatus: result.locationStatus,
        };
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
