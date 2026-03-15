import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ResolutionService } from "./resolution.service";
import {
    AgentChatPayload,
    AGENT_CHAT_PATTERN,
} from "./core/dto/agent-chat.dto";

@Controller()
export class ResolutionController {
    private readonly logger = new Logger(ResolutionController.name);

    constructor(private readonly resolutionService: ResolutionService) {}

    @MessagePattern(AGENT_CHAT_PATTERN)
    async handleRefundRequest(@Payload() payload: AgentChatPayload) {
        this.logger.log(
            `Received refund request for user ${payload.userId}, session ${payload.sessionId}`,
        );
        const result = await this.resolutionService.processRefund(payload);
        return { reply: result };
    }
}
