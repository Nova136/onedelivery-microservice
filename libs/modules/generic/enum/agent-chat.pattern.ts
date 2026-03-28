/** Shared TCP message pattern for agent chat used by all agents and the orchestrator. */
export const AGENT_CHAT_PATTERN = { cmd: "agent.chat" as const };

/** Prefix that callers must use to trigger Guardian's SOP verification role (post-loop). */
export const GUARDIAN_VERIFY_PREFIX = "Verify this" as const;

/** Prefix that callers must use to trigger Guardian's pre-execution gate role (before a high-risk tool fires). */
export const GUARDIAN_GATE_PREFIX = "Gate this" as const;
