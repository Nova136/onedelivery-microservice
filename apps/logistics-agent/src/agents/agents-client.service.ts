import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

export const AGENT_CHAT_PATTERN = { cmd: "agent.chat" as const };

export type AgentName = "resolution" | "qa" | "guardian" | "logistic";

export interface AgentChatPayload {
    userId: string;
    sessionId: string;
    message: string;
}

export interface AgentChatResult {
    reply: string;
}

@Injectable()
export class AgentsClientService {
    constructor(
        @Inject("GUARDIAN_AGENT") private readonly guardianClient: ClientProxy,
    ) {}

    private getClient(agent: AgentName): ClientProxy {
        switch (agent) {
            case "guardian":
                return this.guardianClient;
            default:
                throw new Error(`Unknown agent: ${agent}`);
        }
    }

    async send(agent: AgentName, payload: AgentChatPayload): Promise<string> {
        const client = this.getClient(agent);
        const result = await firstValueFrom(
            client.send<AgentChatResult>(AGENT_CHAT_PATTERN, payload),
        );
        return result?.reply ?? "No response from agent.";
    }
}
