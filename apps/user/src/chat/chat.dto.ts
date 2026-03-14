import { BaseMessage } from '@langchain/core/messages';

export interface ChatHistoryPayload {
  userId: string;
  sessionId: string;
}

export interface ChatSavePayload extends ChatHistoryPayload {
  messages: BaseMessage[];
}

