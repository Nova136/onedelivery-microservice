import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

export type AgentName = "knowledge";

export interface SearchFaqPayload {
    query: string;
}

export interface SearchInternalSopPayload {
    intentCode: string;
    requestingAgent: string;
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

    async searchFaq(payload: SearchFaqPayload): Promise<string> {
        const result = await firstValueFrom(
            this.knowledgeClient.send<QueryResult>("faq", payload),
        );
        return result?.reply ?? "No response from agent.";
    }

    async searchInternalSop(
        payload: SearchInternalSopPayload,
    ): Promise<string> {
        const result = await firstValueFrom(
            this.knowledgeClient.send<QueryResult>("sop", payload),
        );
        return result?.reply ?? "No response from agent.";
    }
}
