import { createHash } from "node:crypto";

import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

import type { ToolSet } from "ai";

const DEFAULT_TOOLKITS = ["gmail", "googlecalendar"];

type ComposioConfig = {
  apiKey: string;
  toolkits: string[];
  userIdSalt: string;
};

let client: Composio<VercelProvider> | undefined;
let clientApiKey: string | undefined;
const toolsByUser = new Map<string, Promise<ToolSet>>();

const configuredToolkits = (): string[] => {
  const value = process.env.COMPOSIO_TOOLKITS?.trim();
  if (!value) return DEFAULT_TOOLKITS;

  const toolkits = value
    .split(",")
    .map((toolkit) => toolkit.trim().toLowerCase())
    .filter(Boolean);

  return toolkits.length > 0 ? [...new Set(toolkits)] : DEFAULT_TOOLKITS;
};

const getConfig = (): ComposioConfig | null => {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) return null;

  const userIdSalt = process.env.COMPOSIO_USER_ID_SALT?.trim();
  if (!userIdSalt) {
    console.error("[composio] Disabled: missing COMPOSIO_USER_ID_SALT");
    return null;
  }

  return { apiKey, toolkits: configuredToolkits(), userIdSalt };
};

const getClient = (apiKey: string): Composio<VercelProvider> => {
  if (!client || clientApiKey !== apiKey) {
    client = new Composio({
      apiKey,
      // Strip optional schema fields; GMI/Luna often 400s on loose tool JSON Schema.
      provider: new VercelProvider({ strict: true }),
    });
    clientApiKey = apiKey;
    toolsByUser.clear();
  }

  return client;
};

/**
 * Derives a stable Composio user ID without disclosing a phone number or other
 * Spectrum sender identifier to Composio.
 */
export const composioUserIdFor = (identityKey: string, salt: string): string => {
  const digest = createHash("sha256")
    .update(salt)
    .update(":")
    .update(identityKey)
    .digest("hex");
  return `imessage_${digest}`;
};

/** True when `value` is an HTTPS Composio Connect authorization URL. */
export const isComposioAuthUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.toLowerCase() === "connect.composio.dev"
    );
  } catch {
    return false;
  }
};

/**
 * Gets cached, user-isolated Composio tools.
 * Returns no tools when sender identity, configuration, or Composio is unavailable.
 */
export const getComposioTools = async (
  identityKey: string | null,
): Promise<ToolSet> => {
  if (!identityKey) return {};

  const config = getConfig();
  if (!config) return {};

  const userId = composioUserIdFor(identityKey, config.userIdSalt);
  const cacheKey = `${userId}:${config.toolkits.join(",")}`;
  const existing = toolsByUser.get(cacheKey);
  if (existing) return await existing;

  const pending = (async (): Promise<ToolSet> => {
    const session = await getClient(config.apiKey).sessions.create(userId, {
      toolkits: config.toolkits,
      manageConnections: true,
    });

    console.log("[composio] Created tool session", {
      sessionId: session.sessionId,
      toolkits: config.toolkits,
      userId,
    });

    return await session.tools();
  })();
  toolsByUser.set(cacheKey, pending);

  try {
    return await pending;
  } catch (error) {
    toolsByUser.delete(cacheKey);
    console.error("[composio] Tools unavailable; continuing without them", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
};
