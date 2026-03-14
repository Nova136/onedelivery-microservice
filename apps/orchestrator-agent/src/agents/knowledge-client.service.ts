import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

export type AgentName = "knowledge";

export interface KnowledgePayload {
    query: string;
}

export interface QueryResult {
    reply: string;
}

@Injectable()
export class KnowledgeClientService {
    constructor(
        @Inject("KNOWLEDGE_AGENT")
        private readonly knowledgeClient: ClientProxy,
    ) {}

    async searchFaq(payload: KnowledgePayload): Promise<string> {
        const result = await firstValueFrom(
            this.knowledgeClient.send<QueryResult>("faq", payload),
        );
        return result?.reply ?? "No response from agent.";
    }

    async searchInternalSop(payload: KnowledgePayload): Promise<string> {
        const result = await firstValueFrom(
            this.knowledgeClient.send<QueryResult>("sop", payload),
        );
        return result?.reply ?? "No response from agent.";
    }
}
