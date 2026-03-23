export class ChatHistoryPayload {
    userId: string;
    sessionId: string;
}

export interface ChatSessionDTO {
    id: string;
    userId: string;
    status: string;
    reviewed: boolean;
    createdAt: Date;
    updatedAt: Date;
    messages: ChatMessageDTO[];
    summary?: string;
    lastSummarizedSequence?: number;
}

export interface ChatMessageDTO {
    id?: string;
    type: "human" | "ai" | "tool" | "system" | "unknown";
    content: string;
    toolCallId?: string;
    sequence: number;
    createdAt: Date;
}

export class ChatSavePayload extends ChatHistoryPayload {
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

export interface UpdateSummaryPayload {
    id: string;
    summary: string;
    lastSummarizedSequence: number;
}

export interface EndChatSessionPayload {
    userId: string;
    sessionId: string;
}
