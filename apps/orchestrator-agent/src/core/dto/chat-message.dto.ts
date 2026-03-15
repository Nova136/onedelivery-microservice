export interface ChatMessageDTO {
    sequence: number;
    type: string;
    content: string;
    toolCallId?: string;
}

export interface ChatSessionDTO {
    id: string;
    userId: string;
    status: string;
    reviewed: boolean;
    createdAt: Date;
    updatedAt: Date;
    messages: ChatMessageDTO[];
}
