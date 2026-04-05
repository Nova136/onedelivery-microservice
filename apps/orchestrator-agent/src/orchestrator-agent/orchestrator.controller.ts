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
import { ClientAuthGuard } from "@libs/utils/guards/auth.guard";
import { CurrentUser } from "@libs/utils/decorators/user.decorator";
import { HandleIncomingMessageDto } from "@libs/modules/generic/dto/handle-incoming-message.dto";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";
import {
    AGENT_CALLBACK_PATTERN,
    AGENT_CHAT_PATTERN,
} from "@libs/modules/generic/enum/agent-chat.pattern";
import { OrchestratorGateway } from "./orchestrator.gateway";
import { HandleAdminInputMessageDto } from "@libs/modules/generic/dto/handle-admin-input-message";
import { WsConnectionService } from "../database/ws-connection.service";

@ApiTags("Orchestrator")
@Controller("orchestrator-agent")
export class OrchestratorController {
    private readonly logger = new Logger(OrchestratorController.name);

    constructor(
        private readonly orchestratorService: OrchestratorService,
        private readonly wsConnectionService: WsConnectionService,
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
        const result = await this.orchestratorService.processHumanInput(
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
    @Post("chat-admin")
    @ApiBearerAuth()
    @ApiOperation({ summary: "Process a user chat message" })
    @ApiBody({ type: HandleAdminInputMessageDto })
    @ApiResponse({ status: 201, description: "AI agent's response." })
    @ApiResponse({ status: 401, description: "Unauthorized" })
    @UseGuards(ClientAuthGuard)
    async handleAdminInputMessage(
        @CurrentUser() adminId: string,
        @Body() body: HandleAdminInputMessageDto,
    ) {
        this.logger.log(
            `Received request for user ${adminId}, session ${body.sessionId}, message: "${body.message}"`,
        );

        // Pass the data to our multi-agent orchestrator
        const result = await this.orchestratorService.processAdminInput(
            adminId,
            body.sessionId,
            body.message,
        );
        const connectionIds = await this.wsConnectionService.findConnectionId(
            body.sessionId,
        );
        if (!connectionIds.length) {
            this.logger.warn(
                `[CB] No connectionId for session=${result.sessionId} — cannot push callback to WebSocket`,
            );
            return { success: true };
        }
        if (!result.response) {
            this.logger.warn(
                `[CB] messageContent is null for session=${result.sessionId} — skipping push`,
            );
            return { success: true };
        }
        this.gateway.sendAgentUpdate(
            connectionIds,
            result.sessionId,
            result.response,
            "ADMIN_UPDATE",
        );

        return {
            message: result.response,
            ...result, // Include extra state for UI compatibility
        };
    }

    /**
     * Process a user chat message (WebSocket)
     * This is the main entry point for WebSocket-triggered messages from the frontend.
     * It also upserts the connectionId <-> sessionId mapping for later callback pushes.
     */
    @MessagePattern(AGENT_CHAT_PATTERN)
    async handleUserInputMessage(@Payload() body: AgentChatPayload) {
        try {
            const { sessionId, userId, message, connectionId } = body;
            if (connectionId) {
                await this.wsConnectionService.upsert(
                    connectionId,
                    userId,
                    sessionId,
                );
                const result = await this.orchestratorService.processHumanInput(
                    userId,
                    sessionId,
                    message,
                );
                const connectionIds =
                    await this.wsConnectionService.findConnectionId(
                        result.sessionId,
                    );

                // Broadcast the agent's response to all connections of the session for UI display
                this.gateway.sendAgentUpdate(
                    connectionIds,
                    sessionId,
                    result.response,
                    "AGENT_UPDATE",
                );

                // Broadcast the user's message back to all connections of the session for UI display
                this.gateway.sendAgentUpdate(
                    connectionIds,
                    sessionId,
                    result.input,
                    "USER_UPDATE",
                );
            }
            return { success: true };
        } catch (error) {
            this.logger.error(`handleCallback error: ${error}`);
            throw error;
        }
    }

    /**
     * Handles callbacks from specialist agents (e.g. task agents, tools) after they complete their work.
     * These messages do not have a connectionId since they are not triggered by a WebSocket message.
     */
    @MessagePattern(AGENT_CALLBACK_PATTERN)
    async handleCallback(@Payload() body: AgentChatPayload) {
        try {
            const { sessionId, userId, message } = body;

            // Specialist agent callback path
            this.logger.log(
                `[CB] processAgentCallback start — session=${sessionId} userId=${userId}`,
            );
            const result = await this.orchestratorService.processAgentCallback(
                sessionId,
                userId,
                message,
            );

            const connectionIds =
                await this.wsConnectionService.findConnectionId(
                    result.sessionId,
                );
            if (!connectionIds.length) {
                this.logger.warn(
                    `[CB] No connectionId for session=${sessionId} — cannot push callback to WebSocket`,
                );
                return { success: true };
            }
            if (!result.messageContent) {
                this.logger.warn(
                    `[CB] messageContent is null for session=${sessionId} — skipping push`,
                );
                return { success: true };
            }
            this.gateway.sendAgentUpdate(
                connectionIds,
                result.sessionId,
                result.response,
                "AGENT_UPDATE",
            );
            return { success: true };
        } catch (error) {
            this.logger.error(`handleCallback error: ${error}`);
            throw error;
        }
    }
}
