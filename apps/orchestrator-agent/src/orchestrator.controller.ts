import { Controller, Post, Body, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { OrchestratorService } from "./orchestrator.service";
import { HandleIncomingMessageDto } from "./core/dto/handle-incoming-message.dto";

@ApiTags("Orchestrator")
@Controller()
export class OrchestratorController {
    private readonly logger = new Logger(OrchestratorController.name);

    constructor(private readonly orchestratorService: OrchestratorService) {}

    @Post()
    @ApiOperation({ summary: "Process a user chat message" })
    @ApiResponse({ status: 201, description: "The AI agent's response." })
    async handleIncomingMessage(@Body() requestData: HandleIncomingMessageDto) {
        this.logger.log(
            `Received request for user ${requestData.userId}, session ${requestData.sessionId}, message: "${requestData.message}"`,
        );

        // Pass the data to our multi-agent orchestrator
        const aiResponse = await this.orchestratorService.processChat(
            requestData.userId,
            requestData.sessionId,
            requestData.message,
        );

        // Send the final text back to the user
        return { reply: aiResponse };
    }
}
