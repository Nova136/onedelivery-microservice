/** Payload for agent.chat TCP message used by all agents and the orchestrator. */
export interface AgentChatPayload {
    connectionId?: string;
    userId: string;
    sessionId: string;
    message: string;
}
