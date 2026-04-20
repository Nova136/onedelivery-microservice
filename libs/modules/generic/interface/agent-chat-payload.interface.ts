/** Payload for agent.chat message used by all agents and the orchestrator. */
export interface AgentChatPayload {
    connectionId?: string;
    userId: string;
    sessionId: string;
    message: string;
}
