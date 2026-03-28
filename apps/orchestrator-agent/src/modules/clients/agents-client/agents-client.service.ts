import { Logger } from "@nestjs/common";

export type AgentName = "resolution" | "qa" | "guardian" | "logistic";

export interface AgentChatResult {
    reply: string;
}

export class AgentsClientService {
    private readonly logger = new Logger(AgentsClientService.name);
    constructor(
        private readonly resolutionClient: any,
        private readonly qaClient: any,
        private readonly guardianClient: any,
        private readonly logisticClient: any,
    ) {}

    private getClient(agent: AgentName): any {
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

    async send(agent: AgentName, payload: any): Promise<string> {
        const client = this.getClient(agent);
        return new Promise((resolve) => {
            client.send("agent.chat", payload).subscribe((res: any) => {
                resolve(res?.reply ?? "No response from agent.");
            });
        });
    }
}
