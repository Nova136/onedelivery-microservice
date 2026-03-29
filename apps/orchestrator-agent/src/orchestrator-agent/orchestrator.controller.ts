import { OrchestratorService } from "./orchestrator.service";
import {
    Post,
    Get,
    Param,
    Body,
    UseGuards,
    Controller,
    Logger,
} from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiOperation,
    ApiBody,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";
import { HandleUserInputMessageDto } from "@libs/modules/generic/dto/handle-user-input-message";
import { ClientAuthGuard } from "@libs/utils/guards/auth.guard";
import { CurrentUser } from "@libs/utils/decorators/user.decorator";
import { HandleIncomingMessageDto } from "@libs/modules/generic/dto/handle-incoming-message.dto";
import { MessagePattern } from "@nestjs/microservices";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";
import { OrchestratorGateway } from "./orchestrator.gateway";

@ApiTags("Orchestrator")
@Controller("orchestrator-agent")
export class OrchestratorController {
    private readonly logger = new Logger(OrchestratorController.name);

    constructor(
        private readonly orchestratorService: OrchestratorService,
        private readonly gateway: OrchestratorGateway,
    ) {}

    /**
     * Get current state of a session
     */
    @Get("state/:sessionId")
    @ApiOperation({ summary: "Get current state of a session" })
    async getSessionState(@Param("sessionId") sessionId: string) {
        return this.orchestratorService.getSessionState(sessionId);
    }

    /**
     * Process a user chat message (HTTP)
     * Matches the requested format exactly
     * For testing without Auth
     */
    @Post()
    async processChat(@Body() body: HandleIncomingMessageDto) {
        this.logger.log(
            `Received request for user ${body.userId}, session ${body.sessionId}, message: "${body.message}"`,
        );

        // Pass the data to our multi-agent orchestrator
        const result = await this.orchestratorService.processChat(
            body.userId,
            body.sessionId,
            body.message,
        );

        return {
            message: result.response,
            ...result, // Include extra state for UI compatibility
        };
    }

    /**
     * Process a user chat message (HTTP)
     * Matches the requested format exactly
     */
    @Post("chat")
    @ApiBearerAuth()
    @ApiOperation({ summary: "Process a user chat message" })
    @ApiBody({ type: HandleUserInputMessageDto })
    @ApiResponse({ status: 201, description: "AI agent's response." })
    @ApiResponse({ status: 401, description: "Unauthorized" })
    @UseGuards(ClientAuthGuard)
    async handleUserInputMessage(
        @CurrentUser() customerId: string,
        @Body() body: HandleUserInputMessageDto,
    ) {
        this.logger.log(
            `Received request for user ${customerId}, session ${body.sessionId}, message: "${body.message}"`,
        );

        // Pass the data to our multi-agent orchestrator
        const result = await this.orchestratorService.processChat(
            customerId,
            body.sessionId,
            body.message,
        );

        return {
            message: result.response,
            ...result, // Include extra state for UI compatibility
        };
    }

    /**
     * Callback for Orchestrator Agent
     */
    @MessagePattern(AGENT_CHAT_PATTERN)
    async handleCallback(@Body() body: AgentChatPayload) {
        try {
            const { sessionId, userId, message } = body;
            const result = await this.orchestratorService.processAgentCallback(
                sessionId,
                userId,
                message,
            );
            this.gateway.sendAgentUpdate(sessionId, result.messageContent);
            return { success: true };
        } catch (error) {
            this.logger.error(`Logistics Callback Error: ${error}`);
            throw error;
        }
    }
}
