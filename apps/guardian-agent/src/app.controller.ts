import { Controller, Post, Body, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AppService } from "./app.service";
import { HandleIncomingMessageDto } from "./core/dto/handle-incoming-message.dto";

export const AGENT_CHAT_PATTERN = { cmd: "agent.chat" };

@ApiTags("Guardian Agent")
@Controller()
export class AppController {
    private readonly logger = new Logger(AppController.name);

    constructor(private readonly appService: AppService) {}

    @MessagePattern(AGENT_CHAT_PATTERN)
    async handleAgentChat(@Payload() payload: HandleIncomingMessageDto) {
        this.logger.log(
            `[TCP] Received for user ${payload.userId}, session ${payload.sessionId}`,
        );
        const reply = await this.appService.processChat(
            payload.userId,
            payload.sessionId,
            payload.message,
        );
        return { reply };
    }

    @Post()
    @ApiOperation({ summary: "Process a user chat message" })
    @ApiResponse({ status: 201, description: "The AI agent's response." })
    async handleIncomingMessage(@Body() requestData: HandleIncomingMessageDto) {
        this.logger.log(
            `Received request for user ${requestData.userId}, session ${requestData.sessionId}, message: "${requestData.message}"`,
        );

        // Pass the data to our multi-agent orchestrator
        const aiResponse = await this.appService.processChat(
            requestData.userId,
            requestData.sessionId,
            requestData.message,
        );

        // Send the final text back to the user
        return { reply: aiResponse };
    }
}
