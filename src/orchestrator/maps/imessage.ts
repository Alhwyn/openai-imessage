import type { AdvancedIMessage } from "@photon-ai/advanced-imessage";
import type { Space, SpectrumInstance } from "@spectrum-ts/core";

export type IMessageRemoteClient = {
  client: AdvancedIMessage;
  phone: string;
};

let spectrumApp: SpectrumInstance | undefined;

export const registerSpectrumApp = (app: SpectrumInstance): void => {
  spectrumApp = app;
};

export const clearSpectrumApp = (): void => {
  spectrumApp = undefined;
};

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

const getRemoteClients = (): IMessageRemoteClient[] | null => {
  if (!spectrumApp) return null;
  const runtime = spectrumApp.__internal.platforms.get("iMessage");
  if (!runtime) return null;
  if (!Array.isArray(runtime.client)) return null;
  const clients = runtime.client.filter(isRemoteClient);
  return clients.length > 0 ? clients : null;
};

const phoneFromSpace = (space: Space): string => {
  if (
    "phone" in space &&
    typeof space.phone === "string" &&
    space.phone.trim()
  ) return space.phone.trim();
  throw new Error("iMessage space is missing phone for location client routing");
};

export const clientForSpace = (space: Space): AdvancedIMessage => {
  const clients = getRemoteClients();
  if (!clients) throw new Error("iMessage location client is not registered");

  const phone = phoneFromSpace(space);
  if (clients.length === 1 && clients[0]?.phone === "shared") return clients[0].client;

  const entry = clients.find((client) => client.phone === phone);
  if (!entry) {
    const available = clients.map((client) => client.phone).join(", ") || "<none>";
    throw new Error(
      `No iMessage client serves phone ${phone}. Available: ${available}`,
    );
  }
  return entry.client;
};
