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
        @Inject("RESOLUTION_AGENT")
        private readonly resolutionClient: ClientProxy,
        @Inject("QA_AGENT") private readonly qaClient: ClientProxy,
        @Inject("GUARDIAN_AGENT") private readonly guardianClient: ClientProxy,
        @Inject("LOGISTIC_AGENT") private readonly logisticClient: ClientProxy,
    ) {}

    private getClient(agent: AgentName): ClientProxy {
        switch (agent) {
            case "resolution":
                return this.resolutionClient;
            case "qa":
                return this.qaClient;
            case "guardian":
                return this.guardianClient;
            case "logistic":
                return this.logisticClient;
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
