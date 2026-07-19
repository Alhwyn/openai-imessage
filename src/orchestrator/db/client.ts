import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | undefined;

export const getConvexUrl = (): string => {
  const url = process.env.CONVEX_URL?.trim();

  if (!url) throw new Error("Missing CONVEX_URL. Run `bun run convex:dev` and add it to your .env.");

  return url;
};

export const getBridgeSecret = (): string => {
  const secret = process.env.ORCHESTRATOR_BRIDGE_SECRET?.trim();

  if (!secret) throw new Error("Missing ORCHESTRATOR_BRIDGE_SECRET. Add it to .env and set the same value with `bunx convex env set ORCHESTRATOR_BRIDGE_SECRET …`.",);

  return secret;
};

export const assertConvexEnv = (): void => {
  getConvexUrl();
  getBridgeSecret();
};

export const getConvexClient = (): ConvexHttpClient => {

  if (!client) client = new ConvexHttpClient(getConvexUrl());

  return client;
};
