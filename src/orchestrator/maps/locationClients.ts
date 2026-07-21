import type { AdvancedIMessage } from "@photon-ai/advanced-imessage";
import type { Space } from "@spectrum-ts/core";

export type IMessageRemoteClient = {
  client: AdvancedIMessage;
  phone: string;
};

let locationClients: IMessageRemoteClient[] | null = null;

/** Inject resolved iMessage location clients at boot (or in tests). */
export const registerLocationClients = (
  clients: IMessageRemoteClient[],
): void => {
  locationClients = clients.length > 0 ? clients : null;
};

export const clearLocationClients = (): void => {
  locationClients = null;
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
  if (!locationClients) throw new Error("iMessage location client is not registered");

  const phone = phoneFromSpace(space);
  if (locationClients.length === 1 && locationClients[0]?.phone === "shared") return locationClients[0].client;

  const entry = locationClients.find((client) => client.phone === phone);
  if (!entry) {
    const available =
      locationClients.map((client) => client.phone).join(", ") || "<none>";
    throw new Error(
      `No iMessage client serves phone ${phone}. Available: ${available}`,
    );
  }
  return entry.client;
};
