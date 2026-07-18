export type MemoryKind = "user" | "agent";

export type CuratedMemories = {
  user: string;
  agent: string;
};

export type MemoryEditInput = {
  spaceId: string;
  kind: MemoryKind;
} & (
  | { action: "add"; text: string }
  | { action: "replace"; oldText: string; text: string }
  | { action: "remove"; oldText: string }
);

export type MemoryEditResult = {
  kind: MemoryKind;
  body: string;
  updatedAt: number;
};
