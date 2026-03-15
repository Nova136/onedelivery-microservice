export interface ChatHistoryPayload {
    userId: string;
    sessionId: string;
}

export interface ChatMessageDTO {
    sequence: number;
    type: "human" | "ai" | "tool" | "unknown";
    content: string;
    toolCallId?: string;
}

export interface ChatSavePayload extends ChatHistoryPayload {
    message: ChatMessageDTO;
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