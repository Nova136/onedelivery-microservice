import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import {
    SearchFaqPayload,
    SearchSopPayload,
    SearchFaqResponse,
    SearchSopResponse,
} from "../core/interface";
@Injectable()
export class KnowledgeClientService {
    constructor(
        @Inject("KNOWLEDGE_AGENT")
        private readonly knowledgeClient: ClientProxy,
    ) {}

    async searchFaq(payload: SearchFaqPayload): Promise<SearchFaqResponse[]> {
        const result = await firstValueFrom(
            this.knowledgeClient.send<SearchFaqResponse[]>("faq", payload),
        );
        return result;
    }

    async searchInternalSop(
        payload: SearchSopPayload,
    ): Promise<SearchSopResponse> {
        const result = await firstValueFrom(
            this.knowledgeClient.send<SearchSopResponse>("sop", payload),
        );
        return result;
    }
}
