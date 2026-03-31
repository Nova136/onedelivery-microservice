import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatMessage } from "../database/entities/chat-message.entity";
import { ChatSession } from "../database/entities/chat-session.entity";
import {
    ChatHistoryPayload,
    ChatSavePayload,
    ChatSessionDTO,
    GetChatSessionsPayload,
    UpdateChatSessionPayload,
    UpdateSummaryPayload,
} from "./chat.dto";

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    constructor(
        @InjectRepository(ChatMessage)
        private readonly chatMessageRepo: Repository<ChatMessage>,
        @InjectRepository(ChatSession)
        private readonly chatSessionRepo: Repository<ChatSession>,
    ) {}

    private async ensureSession(
        id: string,
        userId: string,
    ): Promise<ChatSession> {
        let session = await this.chatSessionRepo.findOne({ where: { id } });
        if (!session) {
            session = this.chatSessionRepo.create({
                id,
                status: "OPEN",
                userId,
            });
            await this.chatSessionRepo.save(session);
        } else if (!session.userId) {
            session.userId = userId;
            await this.chatSessionRepo.save(session);
        }
        return session;
    }

    async getHistory(payload: ChatHistoryPayload): Promise<ChatSessionDTO> {
        const { userId, sessionId } = payload;
        const session = await this.chatSessionRepo
            .createQueryBuilder("session")
            .leftJoinAndSelect("session.messages", "message")
            .where("session.id = :sessionId", { sessionId })
            .andWhere("session.userId = :userId", { userId: userId })
            .orderBy("message.sequence", "ASC")
            .getOne();

        if (!session) {
            this.logger.log(
                `[${sessionId}] New session detected. Returning empty history.`,
            );
            return {
                id: sessionId,
                userId: userId,
                status: "OPEN",
                reviewed: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                messages: [],
                summary: "",
                lastSummarizedSequence: 0,
            };
        }

        return {
            id: session.id,
            userId: session.userId,
            status: session.status,
            reviewed: session.reviewed,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messages: session.messages.map((msg) => ({
                id: msg.id,
                type: msg.type,
                content: msg.content,
                toolCallId: msg.toolCallId,
                sequence: msg.sequence,
                createdAt: msg.createdAt,
            })),
            summary: session.summary,
            lastSummarizedSequence: session.lastSummarizedSequence,
        };
    }

    async saveHistory(payload: ChatSavePayload): Promise<void> {
        const { userId, sessionId, message } = payload;
        const session = await this.ensureSession(sessionId, userId);
        const entity = new ChatMessage();
        entity.sessionId = session;
        entity.sequence = message.sequence;
        entity.type = message.type;
        entity.content = message.content;
        entity.toolCallId = message.toolCallId ?? null;

        await this.chatMessageRepo.save(entity);
    }

    async getSessions(payload: GetChatSessionsPayload): Promise<ChatSession[]> {
        this.logger.log("payload :: ", payload);

        const query = this.chatSessionRepo
            .createQueryBuilder("session")
            .leftJoinAndSelect("session.messages", "message");

        this.logger.log("payload.status :: ", payload.status);
        if (payload.status) {
            query.andWhere("session.status = :status", {
                status: payload.status,
            });
        }

        this.logger.log("payload.reviewed :: ", payload.reviewed);
        if (payload.reviewed !== undefined || payload.reviewed !== null) {
            query.andWhere("session.reviewed = :reviewed", {
                reviewed: String(payload.reviewed),
            });
        }

        this.logger.log("payload.hoursAgo :: ", payload.hoursAgo);
        if (payload.hoursAgo) {
            const date = new Date();
            date.setHours(date.getHours() - payload.hoursAgo);
            query.andWhere("session.createdAt < :date", { date });
        }

        // If filtering by userId, filter sessions directly
        if (payload.userId) {
            query.andWhere("session.userId = :userId", {
                userId: payload.userId,
            });
        }

        query
            .orderBy("session.createdAt", "DESC")
            .addOrderBy("message.sequence", "ASC");

        return query.getMany();
    }

    async getChatHistoryListing(userId: string): Promise<ChatSessionDTO[]> {
        const sessions = await this.chatSessionRepo.find({
            where: { userId },
            order: { createdAt: "DESC" },
        });

        return sessions.map((s) => ({
            id: s.id,
            userId: s.userId,
            status: s.status,
            reviewed: s.reviewed,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            messages: [],
        }));
    }

    async updateSession(payload: UpdateChatSessionPayload): Promise<void> {
        await this.chatSessionRepo.update(payload.id, {
            reviewed: payload.reviewed,
        });
    }

    async updateSummary(payload: UpdateSummaryPayload): Promise<void> {
        await this.chatSessionRepo.update(payload.id, {
            summary: payload.summary,
            lastSummarizedSequence: payload.lastSummarizedSequence,
        });
    }

    async escalateChatSession(
        userId: string,
        sessionId: string,
    ): Promise<void> {
        await this.chatSessionRepo.update(
            { id: sessionId, userId },
            { status: "ESCALATED" },
        );
    }

    async endChatSession(userId: string, sessionId: string): Promise<void> {
        await this.chatSessionRepo.update(
            { id: sessionId, userId },
            { status: "CLOSED" },
        );
    }
}
