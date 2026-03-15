import { Controller } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ChatService } from "./chat.service";
import {
    ChatHistoryPayload,
    ChatMessageDTO,
    ChatSavePayload,
    GetChatSessionsPayload,
    UpdateChatSessionPayload,
} from "./chat.dto";
import { ChatSession } from "../database/entities/chat-session.entity";

@Controller()
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    @MessagePattern({ cmd: "user.chat.getHistory" })
    async getHistory(
        @Payload() payload: ChatHistoryPayload,
    ): Promise<ChatMessageDTO[]> {
        return this.chatService.getHistory(payload);
    }

    @MessagePattern({ cmd: "user.chat.saveHistory" })
    async saveHistory(@Payload() payload: ChatSavePayload): Promise<void> {
        await this.chatService.saveHistory(payload);
    }

    @MessagePattern({ cmd: 'user.chat.getSessionsByFilter' })
    async getSessions(
      @Payload() payload: GetChatSessionsPayload,
    ): Promise<ChatSession[]> {
      return this.chatService.getSessions(payload);
    }

    @MessagePattern({ cmd: 'user.chat.updateSession' })
    async updateSession(@Payload() payload: UpdateChatSessionPayload): Promise<void> {
      await this.chatService.updateSession(payload);
    }
}