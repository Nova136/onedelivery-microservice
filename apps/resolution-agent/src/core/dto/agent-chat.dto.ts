export const AGENT_CHAT_PATTERN = { cmd: "agent.chat" as const };

export interface AgentChatPayload {
    userId: string;
    sessionId: string;
    message: string;
}
