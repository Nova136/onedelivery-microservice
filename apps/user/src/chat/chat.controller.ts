import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BaseMessage } from '@langchain/core/messages';
import { ChatService } from './chat.service';
import { ChatHistoryPayload, ChatSavePayload } from './chat.dto';

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @MessagePattern({ cmd: 'user.chat.getHistory' })
  async getHistory(
    @Payload() payload: ChatHistoryPayload,
  ): Promise<BaseMessage[]> {
    return this.chatService.getHistory(payload);
  }

  @MessagePattern({ cmd: 'user.chat.saveHistory' })
  async saveHistory(@Payload() payload: ChatSavePayload): Promise<void> {
    await this.chatService.saveHistory(payload);
  }
}

