interface ChatMessage {
    sequence: number;
    type: string;
    content: string;
    toolCallId?: string;
}

export interface GetChatHistoryResponse {
    id: string;
    userId: string;
    status: string;
    reviewed: boolean;
    createdAt: Date;
    updatedAt: Date;
    messages: ChatMessage[];
}
