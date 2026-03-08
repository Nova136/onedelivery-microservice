// src/knowledge/knowledge.controller.ts
import { Controller, Post, Body, Get } from "@nestjs/common";
import { KnowledgeService } from "./knowledge.service";
import { SearchQueryDto, AddDocumentDto } from "./core/dto";
import { MessagePattern } from "@nestjs/microservices";

@Controller("api/knowledge")
export class KnowledgeController {
    constructor(private readonly knowledgeService: KnowledgeService) {}

    // TODO: Remove this endpoint in production - it's just for testing and demo purposes
    // 📋 Endpoint to list all FAQs
    @Get("faqs")
    async getAllFaqs() {
        return this.knowledgeService.getAllFaqs();
    }

    // 📋 Endpoint to list all SOPs
    @Get("sops")
    async getAllSops() {
        return this.knowledgeService.getAllSops();
    }

    // �️ Endpoint for the Orchestrator's "Search_FAQ" tool
    @MessagePattern("faq")
    @Post("faq")
    async searchFaq(@Body() body: SearchQueryDto) {
        const result = await this.knowledgeService.searchFAQ(body.query);
        return { reply: result };
    }

    // 🛡️ Endpoint for the Orchestrator's "Search_Internal_SOP" tool
    @MessagePattern("sop")
    @Post("sop")
    async searchSop(@Body() body: SearchQueryDto) {
        const result = await this.knowledgeService.searchInternalSOP(
            body.query,
        );
        return { reply: result };
    }

    // 🛠️ Admin endpoint to add new SOPs to the Postgres Database
    @Post("add")
    async addDocument(@Body() body: AddDocumentDto) {
        await this.knowledgeService.addDocument(
            body.text,
            body.category,
            body.title,
        );
        return {
            success: true,
            message: `Document '${body.title}' embedded and saved!`,
        };
    }
}
