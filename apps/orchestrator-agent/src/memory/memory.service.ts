import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import {
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { CommonService } from "@libs/modules/common/common.service";
import {
    GetChatHistoryPayload,
    GetChatHistoryResponse,
    SaveChatHistoryPayload,
    GetChatHistoryListingPayload,
    GetChatHistoryListingResponse
} from "../core/interface";

@Injectable()
export class MemoryService {
    constructor(
        @Inject("USER_SERVICE")
        private readonly userClient: ClientProxy,
        private readonly commonService: CommonService,
    ) {}

    async getHistory(
        userId: string,
        sessionId: string,
    ): Promise<BaseMessage[]> {
        const payload: GetChatHistoryPayload = {
            userId,
            sessionId,
        };

        const session =
            await this.commonService.sendViaRMQ<GetChatHistoryResponse>(
                this.userClient,
                { cmd: "user.chat.getHistory" },
                payload,
            );

        return session.messages.map((row) => {
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
        sequence: number,
        baseMessage: BaseMessage,
    ): Promise<void> {
        const content =
            typeof baseMessage.content === "string"
                ? baseMessage.content
                : JSON.stringify(baseMessage.content);

        // 2. Map the message type and toolCallId
        let type: string = "unknown";
        let toolCallId: string | null = null;

        if (baseMessage instanceof HumanMessage) {
            type = "human";
        } else if (baseMessage instanceof AIMessage) {
            type = "ai";
        } else if (baseMessage instanceof ToolMessage) {
            type = "tool";
            toolCallId = baseMessage.tool_call_id ?? null;
        }

        // 3. Create the object literal using the interface
        const payload: SaveChatHistoryPayload = {
            userId,
            sessionId,
            message: {
                sequence,
                type,
                content,
                toolCallId,
            },
        };

        await this.commonService.sendViaRMQ<void>(
            this.userClient,
            { cmd: "user.chat.saveHistory" },
            payload,
        );
    }

    async getHistoryListing(
        userId: string
    ): Promise<GetChatHistoryListingResponse[]> {
        const payload: GetChatHistoryListingPayload = {
            userId
        };

       return await this.commonService.sendViaRMQ<GetChatHistoryListingResponse[]>( this.userClient,
        { cmd: "user.chat.getChatHistoryListing" },
        payload,
       );
       
    }
    async getChatHistory(
        userId: string,
        sessionId: string
    ): Promise<GetChatHistoryResponse> {
        const payload: GetChatHistoryPayload = {
            userId,
            sessionId,
        };

        return await this.commonService.sendViaRMQ<GetChatHistoryResponse>( this.userClient,
            { cmd: "user.chat.getHistory" },
            payload,
        );
    }
}
