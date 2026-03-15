import { Controller, Post } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BaseMessage } from '@langchain/core/messages';
import { ChatService } from './chat.service';
import { ChatHistoryPayload, ChatSavePayload, GetChatSessionsPayload, UpdateChatSessionPayload } from './chat.dto';
import { ChatSession } from '../database/entities/chat-session.entity';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Chat')
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

  @MessagePattern({ cmd: 'user.chat.getSessionsByFilter' })
  @ApiOperation({ summary: 'Get all chat sessions for a user via REST' })
  @Post('/chat/sessions')
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

