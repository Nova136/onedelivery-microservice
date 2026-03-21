interface ChatMessage {
    sequence: number;
    type: string;
    content: string;
    toolCallId?: string;
}

export interface SaveChatHistoryPayload {
    userId: string;
    sessionId: string;
    message: ChatMessage;
    summary?: string;
}
