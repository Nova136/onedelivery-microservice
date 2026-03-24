import { Controller, Post, Body, Logger, Get } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AppService } from "./app.service";
import { HandleIncomingMessageDto } from "@libs/modules/generic/dto/handle-incoming-message.dto";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";

@ApiTags("QA Agent")
@Controller()
export class AppController {
    private readonly logger = new Logger(AppController.name);

    constructor(private readonly appService: AppService) {}

    @MessagePattern(AGENT_CHAT_PATTERN)
    async handleReviewSession(@Payload() payload: HandleIncomingMessageDto) {
        this.logger.log(
            `[TCP] Received for user ${payload.userId}, session ${payload.sessionId}`,
        );
        const reply = await this.appService.processChatMessageBySessionId(
            payload.userId,
            payload.sessionId,
        );
        return { reply };
    }

    @MessagePattern({ cmd: "qa.analyzeTrends" })
    async handleAnalyzeTrends() {
        this.logger.log("[RMQ] Received qa.analyzeTrends request");
        return this.appService.analyzeTrends();
    }

    @Get("/analyze-trends")
    @ApiOperation({ summary: "Analyze this month's incident trends via QA agent" })
    @ApiResponse({ status: 200, description: "AI-generated trend analysis." })
    async analyzeTrends() {
        this.logger.log("[HTTP] GET /analyze-trends");
        return this.appService.analyzeTrends();
    }
}
