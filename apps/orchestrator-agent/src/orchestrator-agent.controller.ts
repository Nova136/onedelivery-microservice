import { Controller, Post, Body, Logger, UseGuards } from "@nestjs/common";
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiBody,
} from "@nestjs/swagger";
import { OrchestratorAgentService } from "./orchestrator-agent.service";
import { HandleIncomingMessageDto } from "@libs/modules/generic/dto/handle-incoming-message.dto";
import { ClientAuthGuard } from "@libs/utils/guards/auth.guard";
import { CurrentUser } from "@libs/utils/decorators/user.decorator";
import { HandleGetChatHistoryDto } from "@libs/modules/generic/dto/handle-get-chat-history.dto";
import { HandleUserInputMessageDto } from "@libs/modules/generic/dto/handle-user-input-message";
import { MemoryService } from "./modules/memory/memory.service";
import {
    GetChatHistoryListingResponse,
    GetChatHistoryResponse,
} from "./modules/memory/interface";
import { HandleEndChatSessionDto } from "@libs/modules/generic/dto/handle-end-chat-session.dto";

@ApiTags("Orchestrator")
@Controller("orchestrator-agent")
export class OrchestratorAgentController {
    private readonly logger = new Logger(OrchestratorAgentController.name);

    constructor(
        private readonly orchestratorService: OrchestratorAgentService,
        private readonly memoryService: MemoryService,
    ) {}

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
        const message = await this.orchestratorService.processChat(
            customerId,
            body.sessionId,
            body.message,
        );

        // Send the final text back to the user
        return { message };
    }

    @Post("get-history-listing")
    @ApiBearerAuth()
    @ApiOperation({ summary: "Process a user chat message" })
    @ApiResponse({ status: 201, description: "AI agent's response." })
    @ApiResponse({ status: 401, description: "Unauthorized" })
    @UseGuards(ClientAuthGuard)
    async getUserChatSession(
        @CurrentUser() customerId: string,
    ): Promise<GetChatHistoryListingResponse[]> {
        // Pass the data to our multi-agent orchestrator
        const historyListing =
            await this.memoryService.getHistoryListing(customerId);

        // Send the final text back to the user
        return historyListing;
    }

    @Post("get-chat-history")
    @ApiBearerAuth()
    @ApiOperation({ summary: "Process a user chat message" })
    @ApiBody({ type: HandleGetChatHistoryDto })
    @ApiResponse({ status: 201, description: "AI agent's response." })
    @ApiResponse({ status: 401, description: "Unauthorized" })
    @UseGuards(ClientAuthGuard)
    async getChatHistory(
        @CurrentUser() customerId: string,
        @Body() body: HandleGetChatHistoryDto,
    ): Promise<GetChatHistoryResponse> {
        // Pass the data to our multi-agent orchestrator
        const chatHistory = await this.memoryService.getChatHistory(
            customerId,
            body.sessionId,
        );

        // Send the final text back to the user
        return chatHistory;
    }

    @Post("end-chat-session")
    @ApiBearerAuth()
    @ApiOperation({ summary: "End a chat session" })
    @ApiBody({ type: HandleGetChatHistoryDto })
    @ApiResponse({ status: 201, description: "AI agent's response." })
    @ApiResponse({ status: 401, description: "Unauthorized" })
    @UseGuards(ClientAuthGuard)
    async endChatSession(
        @CurrentUser() customerId: string,
        @Body() body: HandleEndChatSessionDto,
    ): Promise<void> {
        // Pass the data to our multi-agent orchestrator
        return this.memoryService.endChatSession(customerId, body.sessionId);
    }
}
