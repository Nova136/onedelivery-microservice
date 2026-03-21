import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import {
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
    SystemMessage,
} from "@langchain/core/messages";
import { CommonService } from "@libs/modules/common/common.service";
import {
    GetChatHistoryPayload,
    GetChatHistoryResponse,
    SaveChatHistoryPayload,
    GetChatHistoryListingPayload,
    GetChatHistoryListingResponse,
} from "./interface";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "node_modules/@langchain/core/dist/prompts/index.cjs";
import { SUMMARIZER_PROMPT } from "./prompt/summarizer.prompt";
import { EndChatSessionPayload } from "./interface/payload/end-chat-session-payload.interface";

@Injectable()
export class MemoryService {
    private readonly logger = new Logger(MemoryService.name);
    private readonly summarizerLlm: ChatOpenAI;

    constructor(
        @Inject("USER_SERVICE")
        private readonly userClient: ClientProxy,
        private readonly commonService: CommonService,
    ) {
        this.summarizerLlm = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0,
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

    async summarizeConversation(
        olderMessages: BaseMessage[],
        existingSummary?: string | null,
    ): Promise<string> {
        if (!olderMessages || olderMessages.length === 0)
            return existingSummary || "";

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", SUMMARIZER_PROMPT],
            [
                "human",
                "Existing Summary: {existingSummary}\n\nNew messages to integrate into the summary:\n{chatTranscript}",
            ],
        ]);

        // Convert LangChain message objects to a readable transcript string
        const transcript = olderMessages
            .map((msg) => {
                let role = "System";
                if (msg instanceof HumanMessage) role = "User";
                else if (msg instanceof AIMessage) role = "AI";
                else if (msg instanceof ToolMessage) role = "Tool";
                return `${role}: ${msg.content}`;
            })
            .join("\n");

        try {
            const chain = prompt.pipe(this.summarizerLlm);
            const response = await chain.invoke({
                existingSummary: existingSummary || "",
                chatTranscript: transcript,
            });

            return String(response.content);
        } catch (error) {
            this.logger.error(
                "Failed to summarize conversation context.",
                error,
            );
            // Fallback: return the existing summary so we don't lose everything if the API fails
            return existingSummary || "";
        }
    }
}
