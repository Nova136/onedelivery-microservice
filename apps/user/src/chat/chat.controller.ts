import { Controller } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ChatService } from "./chat.service";
import {
    ChatHistoryPayload,
    ChatSavePayload,
    ChatSessionDTO,
    EndChatSessionPayload,
    EscalateChatSessionPayload,
    GetChatSessionsPayload,
    UpdateChatSessionPayload,
    UpdateSummaryPayload,
} from "./chat.dto";
import { ChatSession } from "../database/entities/chat-session.entity";

// TODO: Add authentication and ensure users can only access their own chat sessions and messages.
@Controller()
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    @MessagePattern({ cmd: "user.chat.getHistory" })
    async getHistory(
        @Payload() payload: ChatHistoryPayload,
    ): Promise<ChatSessionDTO> {
        return await this.chatService.getHistory(payload);
    }

    @MessagePattern({ cmd: "user.chat.saveHistory" })
    async saveHistory(@Payload() payload: ChatSavePayload): Promise<void> {
        await this.chatService.saveHistory(payload);
    }

    @MessagePattern({ cmd: "user.chat.getSessionsByFilter" })
    async getSessions(
        @Payload() payload: GetChatSessionsPayload,
    ): Promise<ChatSession[]> {
        return this.chatService.getSessions(payload);
    }

    @MessagePattern({ cmd: "user.chat.getChatHistoryListing" })
    async getChatHistoryListing(
        @Payload() payload: { userId: string },
    ): Promise<ChatSessionDTO[]> {
        return this.chatService.getChatHistoryListing(payload.userId);
    }

    @MessagePattern({ cmd: "user.chat.updateSession" })
    async updateSession(
        @Payload() payload: UpdateChatSessionPayload,
    ): Promise<void> {
        await this.chatService.updateSession(payload);
    }

    @MessagePattern({ cmd: "user.chat.updateSummary" })
    async updateSummary(
        @Payload() payload: UpdateSummaryPayload,
    ): Promise<void> {
        await this.chatService.updateSummary(payload);
    }

    @MessagePattern({ cmd: "user.chat.escalateSession" })
    async escalateSession(
        @Payload() payload: EscalateChatSessionPayload,
    ): Promise<void> {
        await this.chatService.escalateChatSession(
            payload.userId,
            payload.sessionId,
        );
    }

    @MessagePattern({ cmd: "user.chat.endSession" })
    async endSession(@Payload() payload: EndChatSessionPayload): Promise<void> {
        await this.chatService.endChatSession(
            payload.userId,
            payload.sessionId,
        );
    }
}
