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
import { MessagePattern, Payload } from "@nestjs/microservices";
import { AgentChatPayload } from "@libs/modules/generic/interface/agent-chat-payload.interface";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";
import { OrchestratorGateway } from "./orchestrator.gateway";
import { ConfigService } from "@nestjs/config";
import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import axios from "axios";
import { HandleAdminInputMessageDto } from "@libs/modules/generic/dto/handle-admin-input-message";

@ApiTags("Orchestrator")
@Controller("orchestrator-agent")
export class OrchestratorController {
    private readonly logger = new Logger(OrchestratorController.name);

    constructor(
        private readonly orchestratorService: OrchestratorService,
        private readonly gateway: OrchestratorGateway,
        private readonly configService: ConfigService,
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
        const result = await this.orchestratorService.processHumanInput(
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
        this.gateway.sendAdminUpdate(body.sessionId, body.message);

        return {
            message: result.response,
            ...result, // Include extra state for UI compatibility
        };
    }

    /**
     * Callback for Orchestrator Agent (RabbitMQ)
     *
     * Two code paths:
     *  - connectionId present → WebSocket user message from Lambda; call processChat
     *    and push the reply back via API Gateway Management API.
     *  - connectionId absent  → Specialist agent callback; call processAgentCallback
     *    and push update via Socket.IO gateway.
     */
    @MessagePattern(AGENT_CHAT_PATTERN)
    async handleCallback(@Payload() body: AgentChatPayload) {
        try {
            const { sessionId, userId, message, connectionId } = body;
            const endpoint = this.configService.get<string>(
                "WEBSOCKET_API_ENDPOINT",
            );

            if (connectionId) {
                // WebSocket path: initial user message forwarded by Lambda or ws-gateway
                const result = await this.orchestratorService.processHumanInput(
                    userId,
                    sessionId,
                    message,
                    connectionId,
                );
                if (endpoint) {
                    const payload = JSON.stringify({
                        reply: result.response,
                        sessionId,
                    });
                    if (endpoint.startsWith("http://")) {
                        // Local dev: plain HTTP POST — no AWS credentials needed
                        await axios.post(
                            `${endpoint}/@connections/${connectionId}`,
                            payload,
                            { headers: { "Content-Type": "application/json" } },
                        );
                    } else {
                        // Production: AWS API Gateway Management API (SigV4 signed)
                        const client = new ApiGatewayManagementApiClient({
                            endpoint,
                            region:
                                this.configService.get<string>("AWS_REGION") ??
                                "ap-southeast-1",
                        });
                        await client.send(
                            new PostToConnectionCommand({
                                ConnectionId: connectionId,
                                Data: Buffer.from(payload),
                            }),
                        );
                    }
                }
                return { success: true };
            }

            // Specialist agent callback path
            this.logger.log(`[CB] processAgentCallback start — session=${sessionId} userId=${userId}`);
            const result = await this.orchestratorService.processAgentCallback(
                sessionId,
                userId,
                message,
            );
            this.logger.log(`[CB] processAgentCallback done — connectionId=${result.connectionId} messageContent=${result.messageContent ? `"${String(result.messageContent).slice(0, 80)}..."` : "null"}`);

            const callbackConnectionId = result.connectionId;
            if (!callbackConnectionId) {
                this.logger.warn(
                    `[CB] No connectionId for session=${sessionId} — cannot push callback to WebSocket`,
                );
                return { success: true };
            }
            if (!result.messageContent) {
                this.logger.warn(`[CB] messageContent is null for session=${sessionId} — skipping push`);
                return { success: true };
            }
            const wsPayload = JSON.stringify({ reply: result.messageContent, sessionId });
            if (endpoint?.startsWith("http://")) {
                // Local dev: plain HTTP POST — no AWS credentials needed
                this.logger.log(`[CB] Pushing to local ws-gateway: ${endpoint}/@connections/${callbackConnectionId}`);
                await axios.post(
                    `${endpoint}/@connections/${callbackConnectionId}`,
                    wsPayload,
                    { headers: { "Content-Type": "application/json" } },
                );
                this.logger.log(`[CB] Successfully pushed to local ws-gateway for connectionId=${callbackConnectionId}`);
            } else if (endpoint) {
                // Production: AWS API Gateway Management API (SigV4 signed)
                this.logger.log(`[CB] Pushing to API Gateway: endpoint=${endpoint} connectionId=${callbackConnectionId}`);
                const client = new ApiGatewayManagementApiClient({
                    endpoint,
                    region:
                        this.configService.get<string>("AWS_REGION") ??
                        "ap-southeast-1",
                });
                await client.send(
                    new PostToConnectionCommand({
                        ConnectionId: callbackConnectionId,
                        Data: Buffer.from(wsPayload),
                    }),
                );
                this.logger.log(`[CB] Successfully pushed to API Gateway for connectionId=${callbackConnectionId}`);
            } else {
                this.logger.warn(`[CB] WEBSOCKET_API_ENDPOINT is not set — cannot push callback`);
            }

            // this.gateway.sendAgentUpdate(sessionId, result.messageContent);
            return { success: true };
        } catch (error) {
            this.logger.error(`handleCallback error: ${error}`);
            throw error;
        }
    }
}
