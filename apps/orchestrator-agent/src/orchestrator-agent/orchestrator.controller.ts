import { WebSocket } from "ws";
import { OrchestratorService } from "./orchestrator.service";
import { Post, Body, UseGuards, Controller, Logger } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiOperation,
    ApiBody,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";
import { ClientAuthGuard } from "@libs/utils/guards/auth.guard";
import { CurrentUser } from "@libs/utils/decorators/user.decorator";
import { HandleUserInputMessageDto } from "@libs/modules/generic/dto/handle-user-input-message";
import { HandleIncomingMessageDto } from "@libs/modules/generic/dto/handle-incoming-message.dto";

@ApiTags("Orchestrator")
@Controller("orchestrator-agent")
export class OrchestratorController {
    private orchestratorService: OrchestratorService;
    private logger = new Logger(OrchestratorController.name);

    constructor(orchestratorService: OrchestratorService) {
        this.orchestratorService = orchestratorService;
    }

    /**
     * Handle incoming WebSocket messages (e.g., chat)
     */
    async handleWebSocketMessage(ws: WebSocket, sessionId: string, data: any) {
        try {
            if (data.type === "CHAT_MESSAGE") {
                const { message, userId } = data;

                const result = await this.orchestratorService.processChat(
                    userId,
                    sessionId,
                    message,
                );

                ws.send(
                    JSON.stringify({
                        type: "CHAT_RESPONSE",
                        ...result,
                    }),
                );
            }
        } catch (error) {
            this.logger.error(`WebSocket Message Error: ${error}`);
            ws.send(
                JSON.stringify({
                    type: "ERROR",
                    message: "Failed to process message",
                }),
            );
        }
    }

    @Post()
    @ApiOperation({ summary: "Process a user chat message" })
    @ApiResponse({ status: 201, description: "The AI agent's response." })
    async handleIncomingMessage(@Body() requestData: HandleIncomingMessageDto) {
        this.logger.log(
            `Received request for user ${requestData.userId}, session ${requestData.sessionId}, message: "${requestData.message}"`,
        );

        // Pass the data to our multi-agent orchestrator
        const result = await this.orchestratorService.processChat(
            requestData.userId,
            requestData.sessionId,
            requestData.message,
        );

        // Send the final text back to the user
        return { reply: result.response };
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

        // Send the final text back to the user
        return {
            message: result.response,
            ...result, // Include extra state for UI compatibility
        };
    }

    /**
     * Callback for Logistics Agent
     */
    @Post("callback/logistics")
    @ApiOperation({ summary: "Callback for Logistics Agent" })
    async handleLogisticsCallback(@Body() body: any) {
        try {
            const {
                sessionId,
                result,
                status,
                requestId,
                orderId,
                ...metadata
            } = body;
            return await this.orchestratorService.processAgentCallback(
                sessionId,
                result,
                status,
                "logistics",
                requestId,
                { ...metadata, orderId },
            );
        } catch (error) {
            this.logger.error(`Logistics Callback Error: ${error}`);
            throw error;
        }
    }

    /**
     * Callback for Resolution Agent
     */
    @Post("callback/resolution")
    @ApiOperation({ summary: "Callback for Resolution Agent" })
    async handleResolutionCallback(@Body() body: any) {
        try {
            const {
                sessionId,
                result,
                status,
                requestId,
                orderId,
                ...metadata
            } = body;
            return await this.orchestratorService.processAgentCallback(
                sessionId,
                result,
                status,
                "resolution",
                requestId,
                { ...metadata, orderId },
            );
        } catch (error) {
            this.logger.error(`Resolution Callback Error: ${error}`);
            throw error;
        }
    }
}
