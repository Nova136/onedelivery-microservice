import { Controller } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ChatService } from "./chat.service";
import {
    ChatHistoryPayload,
    ChatMessageDTO,
    ChatSavePayload,
} from "./chat.dto";

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
}
