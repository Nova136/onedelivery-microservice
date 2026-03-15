import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

export type AgentName = "guardian" | "order" | "payment";

@Injectable()
export class AgentsClientService {
    constructor(
        @Inject("GUARDIAN_AGENT") private readonly guardianClient: ClientProxy,
        @Inject("ORDER_SERVICE") private readonly orderClient: ClientProxy,
        @Inject("PAYMENT_SERVICE") private readonly paymentClient: ClientProxy,
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
}
