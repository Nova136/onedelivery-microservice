export interface ChatMessageDTO {
    sequence: number;
    type: string;
    content: string;
    toolCallId?: string;
}
