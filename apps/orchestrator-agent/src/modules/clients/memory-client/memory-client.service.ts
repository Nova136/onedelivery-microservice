import {
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
    SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
    EndChatSessionPayload,
    GetChatHistoryListingPayload,
    GetChatHistoryListingResponse,
    GetChatHistoryPayload,
    GetChatHistoryResponse,
    SaveChatHistoryPayload,
} from "./interface";
import { CommonService } from "@libs/modules/common/common.service";
import { ClientProxy } from "@nestjs/microservices";
import { Inject } from "@nestjs/common";

export class MemoryClientService {
    constructor(
        @Inject("USER_SERVICE")
        private readonly userClient: ClientProxy,
        private readonly commonService: CommonService,
    ) {}

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
        } else if (baseMessage instanceof SystemMessage) {
            type = "system";
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
        userId: string,
    ): Promise<GetChatHistoryListingResponse[]> {
        const payload: GetChatHistoryListingPayload = {
            userId,
        };

        return await this.commonService.sendViaRMQ<
            GetChatHistoryListingResponse[]
        >(this.userClient, { cmd: "user.chat.getChatHistoryListing" }, payload);
    }

    async getChatHistory(
        userId: string,
        sessionId: string,
    ): Promise<GetChatHistoryResponse> {
        const payload: GetChatHistoryPayload = {
            userId,
            sessionId,
        };

        return await this.commonService.sendViaRMQ<GetChatHistoryResponse>(
            this.userClient,
            { cmd: "user.chat.getHistory" },
            payload,
        );
    }

    async updateSessionSummary(
        sessionId: string,
        summary: string,
        lastSummarizedSequence: number,
    ): Promise<void> {
        await this.commonService.sendViaRMQ<void>(
            this.userClient,
            { cmd: "user.chat.updateSummary" },
            { id: sessionId, summary, lastSummarizedSequence },
        );
    }

    async endChatSession(userId: string, sessionId: string): Promise<void> {
        const payload: EndChatSessionPayload = {
            userId,
            sessionId,
        };

        return await this.commonService.sendViaRMQ<void>(
            this.userClient,
            { cmd: "user.chat.endSession" },
            payload,
        );
    }
}
