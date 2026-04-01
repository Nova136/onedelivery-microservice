import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

export interface SearchInternalSopPayload {
    intentCode: string;
    requestingAgent: string;
}

export interface SopResult {
    intentCode: string;
    agentOwner: string;
    title: string;
    requiredData: unknown[];
    workflowSteps: string[];
    permittedTools: string[];
}

@Injectable()
export class KnowledgeClientService {
    constructor(
        @Inject("KNOWLEDGE_AGENT")
        private readonly knowledgeClient: ClientProxy,
    ) {}

    async searchInternalSop(payload: SearchInternalSopPayload): Promise<string> {
        const result = await firstValueFrom(
            this.knowledgeClient.send<SopResult>("sop", payload),
        );
        if (!result?.title) return "";
        return [
            `Title: ${result.title}`,
            `Steps:\n${result.workflowSteps.join("\n")}`,
            result.permittedTools.length
                ? `Permitted Tools: ${result.permittedTools.join(", ")}`
                : "",
        ]
            .filter(Boolean)
            .join("\n\n");
    }
}