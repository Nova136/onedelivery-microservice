import { Controller, Post, Body } from "@nestjs/common";
import { OrchestratorService } from "./orchestrator.service";
import { HandleIncomingMessageDto } from "./core/dto/handle-incoming-message.dto";

@Controller()
export class OrchestratorController {
    constructor(private readonly orchestratorService: OrchestratorService) {}

    @Post()
    async handleIncomingMessage(@Body() requestData: HandleIncomingMessageDto) {
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
