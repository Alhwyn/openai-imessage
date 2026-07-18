export type MessageRole = "user" | "assistant";

export type StoredMessage = {
  role: MessageRole;
  searchText: string;
  payloadJson: string;
  createdAt: number;
};

export type MessageInput = {
  role: MessageRole;
  searchText: string;
  payloadJson: string;
  createdAt?: number;
};
