export const assertBridgeSecret = (secret: string): void => {
  const expected = process.env.ORCHESTRATOR_BRIDGE_SECRET?.trim();

  if (!expected) throw new Error("ORCHESTRATOR_BRIDGE_SECRET is not configured on Convex");
  
  if (secret !== expected) throw new Error("Unauthorized");
};

export const USER_MEMORY_CHAR_LIMIT = 1_375;
export const AGENT_MEMORY_CHAR_LIMIT = 2_200;

export const charLimitForKind = (kind: "user" | "agent"): number => {
  return kind === "user" ? USER_MEMORY_CHAR_LIMIT : AGENT_MEMORY_CHAR_LIMIT;
};
