import type { IMessageRemoteClient } from "./maps/locationClients";
import type { SpectrumInstance } from "@spectrum-ts/core";

/**
 * Checks if a value is a valid IMessage remote client.
 */
const isRemoteClient = (value: unknown): value is IMessageRemoteClient => {
  if (!value || typeof value !== "object") return false;
  const entry = value as { client?: unknown; phone?: unknown };
  return (
    typeof entry.phone === "string" &&
    !!entry.client &&
    typeof entry.client === "object" &&
    "locations" in entry.client
  );
};

/**
 * Boot-only adapter: Spectrum has no public location-client accessor yet,
 * so resolve clients once at startup and inject into maps.
 */
export const resolveIMessageLocationClients = (
  app: SpectrumInstance,
): ReadonlyArray<IMessageRemoteClient> => {
  const runtime = app.__internal.platforms.get("iMessage");
  if (!runtime || !Array.isArray(runtime.client)) return [];
  return runtime.client.filter(isRemoteClient);
}
