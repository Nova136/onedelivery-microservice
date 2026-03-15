import { BaseMessage } from "@langchain/core/messages";
import { ApiProperty } from "@nestjs/swagger";

export interface ChatHistoryPayload {
  userId: string;
  sessionId: string;
}

export interface ChatSavePayload extends ChatHistoryPayload {
  messages: BaseMessage[];
}

export class GetChatSessionsPayload {
  status?: string;
  reviewed?: boolean;
  hoursAgo?: number;
  userId?: string;
}

export interface UpdateChatSessionPayload {
  id: string;
  reviewed: boolean;
}
