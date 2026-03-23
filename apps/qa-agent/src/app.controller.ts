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

    @Get("/analyze-trends")
    @ApiOperation({ summary: "Analyze incidents trends" })
    @ApiResponse({ status: 201, description: "The AI agent's response." })
    async analyzeTrends(@Body() requestData: HandleIncomingMessageDto) {
        // this.logger.log(
        //     `Received request for admin ${requestData.userId}, session ${requestData.sessionId}, message: "${requestData.message}"`,
        // );
        // // Pass the data to our multi-agent orchestrator
        // const aiResponse = await this.appService.processChat(
        //     requestData.userId,
        //     requestData.sessionId,
        //     requestData.message,
        // );
        // // Send the final text back to the user
        // return { reply: aiResponse };
    }
}
