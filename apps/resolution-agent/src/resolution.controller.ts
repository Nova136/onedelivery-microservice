import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ResolutionService } from "./resolution.service";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";

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

    @MessagePattern("resolution.cancel")
    async handleRefundCancelRequest(@Payload() orderId: string){
        this.logger.log(
            `Received cancel refund request for order ${orderId}`);
        const result = await this.resolutionService.processCancelRefund(orderId);
        return result;
    }
}
