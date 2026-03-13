import { Injectable } from '@nestjs/common';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { ChatSession } from '../database/entities/chat-session.entity';
import { ChatHistoryPayload, ChatSavePayload } from './chat.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatSession)
    private readonly chatSessionRepo: Repository<ChatSession>,
  ) {}

  private async ensureSession(id: string): Promise<ChatSession> {
    let session = await this.chatSessionRepo.findOne({ where: { id } });
    if (!session) {
      session = this.chatSessionRepo.create({ id, status: 'OPEN' });
      await this.chatSessionRepo.save(session);
    }
    return session;
  }

  async getHistory(payload: ChatHistoryPayload): Promise<BaseMessage[]> {
    const { userId, sessionId } = payload;
    const rows = await this.chatMessageRepo.find({
      where: {
        userId,
        sessionId: { id: sessionId },
      },
      order: { sequence: 'ASC' },
    });

    return rows.map((row) => {
      if (row.type === 'human') return new HumanMessage(row.content);
      if (row.type === 'ai') return new AIMessage(row.content);
      if (row.type === 'tool')
        return new ToolMessage({
          content: row.content,
          tool_call_id: row.toolCallId ?? '',
        });
      return new HumanMessage(row.content);
    });
  }

  async saveHistory(payload: ChatSavePayload): Promise<void> {
    const { userId, sessionId, messages } = payload;
    const session = await this.ensureSession(sessionId);

    await this.chatMessageRepo.delete({
      userId,
      sessionId: { id: sessionId },
    });

    const entities: ChatMessage[] = messages.map((msg, index) => {
      const e = new ChatMessage();
      e.userId = userId;
      e.sessionId = session;
      e.sequence = index;
      e.toolCallId = null;

      if (msg instanceof HumanMessage) {
        e.type = 'human';
        e.content =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
      } else if (msg instanceof AIMessage) {
        e.type = 'ai';
        e.content =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
      } else if (msg instanceof ToolMessage) {
        e.type = 'tool';
        e.content =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
        e.toolCallId = msg.tool_call_id ?? null;
      } else {
        e.type = 'unknown';
        e.content =
          typeof (msg as any).content === 'string'
            ? (msg as any).content
            : JSON.stringify((msg as any).content);
      }
      return e;
    });

    if (entities.length > 0) {
      await this.chatMessageRepo.save(entities);
    }
  }
}

