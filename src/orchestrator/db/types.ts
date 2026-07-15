import type { MemoryKind } from "../memory/types";

export type StoredMessage = {
  role: string;
  searchText: string;
  payloadJson: string;
  createdAt: number;
};

export type MessageInput = {
  role: string;
  searchText: string;
  payloadJson: string;
  createdAt?: number;
};

export type MemoryEditResult = {
  kind: MemoryKind;
  body: string;
  updatedAt: number;
};
