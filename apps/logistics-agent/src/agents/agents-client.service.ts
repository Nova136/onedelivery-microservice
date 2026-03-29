import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";

export type AgentName = "resolution" | "qa" | "guardian" | "logistic";

export interface AgentChatResult {
    reply: string;
}

@Injectable()
export class AgentsClientService {
    constructor(
        @Inject("GUARDIAN_AGENT") private readonly guardianClient: ClientProxy,
        @Inject("RESOLUTION_AGENT") private readonly resolutionClient: ClientProxy,
    ) {}

    private getClient(agent: AgentName): ClientProxy {
        switch (agent) {
            case "guardian":
                return this.guardianClient;
            case "resolution":
                return this.resolutionClient;
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
