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
import { HandleEndChatSessionDto } from "@libs/modules/generic/dto/handle-end-chat-session.dto";
import { HandleGetChatHistoryDto } from "@libs/modules/generic/dto/handle-get-chat-history.dto";
import {
    GetChatHistoryListingResponse,
    GetChatHistoryResponse,
} from "../modules/clients/memory-client/interface";
import { MemoryClientService } from "../modules/clients/memory-client/memory-client.service";

@ApiTags("Session")
@Controller("orchestrator-agent")
export class SessionController {
    private readonly logger = new Logger(SessionController.name);

    constructor(private readonly memoryService: MemoryClientService) {}

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
