import { Injectable } from "@nestjs/common";
import {
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
} from "@langchain/core/messages";

@Injectable()
export class MemoryService {
    // TODO: To connect to actual DB, replace this Map with a real database client (e.g., Prisma, MongoDB, etc.)
    private db = new Map<string, any[]>();

    // Helper to create a unique key for each session
    private getStorageKey(userId: string, sessionId: string): string {
        return `${userId}:${sessionId}`;
    }

    // 1. Load messages from the DB and convert them back to LangChain objects
    async getHistory(
        userId: string,
        sessionId: string,
    ): Promise<BaseMessage[]> {
        const key = this.getStorageKey(userId, sessionId);
        const rawMessages = this.db.get(key) || [];

        return rawMessages.map((msg) => {
            if (msg.type === "human") return new HumanMessage(msg.content);
            if (msg.type === "ai") return new AIMessage(msg.content);
            if (msg.type === "tool")
                return new ToolMessage({
                    content: msg.content,
                    tool_call_id: msg.tool_call_id,
                });
            return new HumanMessage(msg.content);
        });
    }

    // 2. Save using the new session key
    async saveHistory(
        userId: string,
        sessionId: string,
        messages: BaseMessage[],
    ): Promise<void> {
        const key = this.getStorageKey(userId, sessionId);

        const serialized = messages.map((msg) => {
            let type = "unknown";
            if (msg instanceof HumanMessage) type = "human";
            else if (msg instanceof AIMessage) type = "ai";
            else if (msg instanceof ToolMessage) type = "tool";

            return {
                type,
                content: msg.content,
                tool_call_id:
                    msg instanceof ToolMessage ? msg.tool_call_id : undefined,
            };
        });

        this.db.set(key, serialized);
    }
}
