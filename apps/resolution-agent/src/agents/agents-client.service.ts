import { Injectable, Inject, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";

export type AgentName = "guardian" | "order" | "payment";

@Injectable()
export class AgentsClientService {
    private readonly logger = new Logger(AgentsClientService.name);

    constructor(
        @Inject("GUARDIAN_AGENT") private readonly guardianClient: ClientProxy,
        @Inject("ORDER_SERVICE") private readonly orderClient: ClientProxy,
        @Inject("PAYMENT_SERVICE") private readonly paymentClient: ClientProxy,
        @Inject("ORCHESTRATOR_AGENT")
        private readonly orchestratorClient: ClientProxy,
    ) {}

    private getClient(agent: AgentName): ClientProxy {
        switch (agent) {
            case "guardian":
                return this.guardianClient;
            case "order":
                return this.orderClient;
            case "payment":
                return this.paymentClient;
            default:
                throw new Error(`Unknown agent: ${agent}`);
        }
    }

    async send<TResult = any, TPayload = any>(
        agent: AgentName,
        pattern: object,
        payload: TPayload,
    ): Promise<any> {
        const client = this.getClient(agent);
        return await firstValueFrom(client.send<TResult>(pattern, payload));
    }

    /**
     * Push the final reply to the orchestrator (e.g. WebSocket). Fire-and-forget; mirrors logistics-agent.
     */
    notifyOrchestrator(payload: AgentChatPayload): void {
        void firstValueFrom(
            this.orchestratorClient.send(AGENT_CHAT_PATTERN, payload),
        ).catch((err) =>
            this.logger.error(
                "Failed to notify orchestrator",
                err instanceof Error ? err.stack : String(err),
            ),
        );
    }
}
