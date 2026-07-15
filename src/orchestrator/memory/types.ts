export type MemoryKind = "user" | "agent";

export type MemoryEditAction = "add" | "replace" | "remove";

export type CuratedMemories = {
  user: string;
  agent: string;
};

export type MemoryEditInput = {
  spaceId: string;
  kind: MemoryKind;
  action: MemoryEditAction;
  text?: string;
  oldText?: string;
};
