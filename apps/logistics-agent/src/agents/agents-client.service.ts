import { Injectable, Inject, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import {
    AGENT_CALLBACK_PATTERN,
    AGENT_CHAT_PATTERN,
} from "@libs/modules/generic/enum/agent-chat.pattern";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";

export type AgentName =
    | "orchestrator"
    | "resolution"
    | "qa"
    | "guardian"
    | "logistic";

export interface AgentChatResult {
    reply: string;
}

@Injectable()
export class AgentsClientService {
    private readonly logger = new Logger(AgentsClientService.name);

    constructor(
        @Inject("ORCHESTRATOR_AGENT")
        private readonly orchestratorClient: ClientProxy,
        @Inject("GUARDIAN_AGENT") private readonly guardianClient: ClientProxy,
    ) {}

    private getClient(agent: AgentName): ClientProxy {
        switch (agent) {
            case "guardian":
                return this.guardianClient;
            case "orchestrator":
                return this.orchestratorClient;
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

    /**
     * Push the final reply to the orchestrator (e.g. WebSocket). Fire-and-forget; mirrors logistics-agent.
     */
    notifyOrchestrator(payload: AgentChatPayload): void {
        void firstValueFrom(
            this.orchestratorClient.send(AGENT_CALLBACK_PATTERN, payload),
        ).catch((err) =>
            this.logger.error(
                "Failed to notify orchestrator",
                err instanceof Error ? err.stack : String(err),
            ),
        );
    }
}
