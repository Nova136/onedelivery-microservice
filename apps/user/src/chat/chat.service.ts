import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatMessage } from "../database/entities/chat-message.entity";
import { ChatSession } from "../database/entities/chat-session.entity";
import {
    ChatHistoryPayload,
    ChatMessageDTO,
    ChatSavePayload,
} from "./chat.dto";

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
            session = this.chatSessionRepo.create({ id, status: "OPEN" });
            await this.chatSessionRepo.save(session);
        }
        return session;
    }

    async getHistory(payload: ChatHistoryPayload): Promise<ChatMessageDTO[]> {
        const { userId, sessionId } = payload;
        const rows = await this.chatMessageRepo.find({
            where: {
                userId,
                sessionId: { id: sessionId },
            },
            order: { sequence: "ASC" },
        });

        return rows.map((row) => {
            return {
                sequence: row.sequence,
                type: row.type,
                content: row.content,
                toolCallId: row.toolCallId,
            };
        });
    }

    async saveHistory(payload: ChatSavePayload): Promise<void> {
        const { userId, sessionId, message } = payload;
        console.log(payload);
        const session = await this.ensureSession(sessionId);
        const entity = new ChatMessage();
        entity.userId = userId;
        entity.sessionId = session;
        entity.sequence = message.sequence;
        entity.type = message.type;
        entity.content = message.content;
        entity.toolCallId = message.toolCallId ?? null;

        await this.chatMessageRepo.save(entity);
    }
}
