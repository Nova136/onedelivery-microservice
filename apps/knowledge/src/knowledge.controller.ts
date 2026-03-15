// src/knowledge/knowledge.controller.ts
import {
    Controller,
    Post,
    Body,
    Get,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import { KnowledgeService } from "./knowledge.service";
import {
    AddDocumentPayload,
    SearchFaqPayload,
    SearchSopPayload,
} from "./core/dto";
import { MessagePattern } from "@nestjs/microservices";
import { SearchFaqResponse, SearchSopResponse } from "./core/interface";

@Controller("api/knowledge")
export class KnowledgeController {
    private readonly logger = new Logger(KnowledgeController.name);

    constructor(private readonly knowledgeService: KnowledgeService) {}

    // TODO: Remove this endpoint in production - it's just for testing and demo purposes
    // Endpoint to list all FAQs
    @Get("faqs")
    async getAllFaqs() {
        this.logger.log("Fetching all FAQs");
        return this.knowledgeService.getAllFaqs();
    }

    // TODO: Remove this endpoint in production - it's just for testing and demo purposes
    // Endpoint to list all SOPs
    @Get("sops")
    async getAllSops() {
        this.logger.log("Fetching all SOPs");
        return this.knowledgeService.getAllSops();
    }

    // ️Endpoint for the Orchestrator's "Search_FAQ" tool
    @MessagePattern("faq")
    @Post("faq")
    async searchFaq(
        @Body() body: SearchFaqPayload,
    ): Promise<SearchFaqResponse[]> {
        this.logger.log(`Received FAQ search query: "${body.query}"`);
        const result = await this.knowledgeService.searchFAQ(body.query);
        return result;
    }

    // Endpoint for the Orchestrator's "Search_Internal_SOP" tool
    @MessagePattern("sop")
    @Post("sop")
    async searchSop(
        @Body() body: SearchSopPayload,
    ): Promise<SearchSopResponse> {
        this.logger.log(
            `Received SOP search intent: "${body.intentCode}" from agent "${body.requestingAgent}"`,
        );
        const result = await this.knowledgeService.searchInternalSOP(
            body.intentCode,
            body.requestingAgent,
        );

        if (!result) {
            throw new NotFoundException(
                `SOP for intent ${body.intentCode} not found.`,
            );
        }

        return {
            intentCode: result.intentCode,
            agentOwner: result.agentOwner,
            title: result.title,
            requiredData: result.requiredData,
            workflowSteps: result.workflowSteps,
            permittedTools: result.permittedTools,
        };
    }

    // Admin endpoint to add new SOPs to the Postgres Database
    @Post("add")
    async addDocument(@Body() body: AddDocumentPayload) {
        this.logger.log(
            `Received document to add: Title="${body.title}", Content="${body.content}"`,
        );
        await this.knowledgeService.addDocument(body.title, body.content);
        return {
            success: true,
            message: `Document '${body.title}' embedded and saved!`,
        };
    }
}
