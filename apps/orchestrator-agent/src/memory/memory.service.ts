import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { ChatMessage } from "../database/entities/chat-message.entity";

@Injectable()
export class MemoryService {
    constructor(
        @InjectRepository(ChatMessage)
        private readonly chatMessageRepo: Repository<ChatMessage>,
    ) {}

    async getHistory(
        userId: string,
        sessionId: string,
    ): Promise<BaseMessage[]> {
        const rows = await this.chatMessageRepo.find({
            where: { userId, sessionId },
            order: { sequence: "ASC" },
        });

        return rows.map((row) => {
            if (row.type === "human") return new HumanMessage(row.content);
            if (row.type === "ai") return new AIMessage(row.content);
            if (row.type === "tool")
                return new ToolMessage({
                    content: row.content,
                    tool_call_id: row.toolCallId ?? "",
                });
            return new HumanMessage(row.content);
        });
    }

    async saveHistory(
        userId: string,
        sessionId: string,
        messages: BaseMessage[],
    ): Promise<void> {
        await this.chatMessageRepo.delete({ userId, sessionId });

        const entities: ChatMessage[] = messages.map((msg, index) => {
            const entity = new ChatMessage();
            entity.userId = userId;
            entity.sessionId = sessionId;
            entity.sequence = index;
            entity.toolCallId = null;
            if (msg instanceof HumanMessage) {
                entity.type = "human";
                entity.content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
            } else if (msg instanceof AIMessage) {
                entity.type = "ai";
                entity.content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
            } else if (msg instanceof ToolMessage) {
                entity.type = "tool";
                entity.content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
                entity.toolCallId = msg.tool_call_id ?? null;
            } else {
                entity.type = "unknown";
                entity.content = typeof (msg as any).content === "string" ? (msg as any).content : JSON.stringify((msg as any).content);
            }
            return entity;
        });

        if (entities.length > 0) {
            await this.chatMessageRepo.save(entities);
        }
    }
}
