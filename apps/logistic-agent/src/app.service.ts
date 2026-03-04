import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { MemoryService } from "./memory/memory.service";

/**
 * Logistics specialist agent. Invoked by the orchestrator via TCP (agent.chat).
 * Processes tracking, delivery policy, and cancellations. Responds back to the
 * orchestrator with a string reply (no routing tools).
 */
@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);
    private readonly llm: ChatOpenAI;
    private readonly prompt: ChatPromptTemplate;

    constructor(private memoryService: MemoryService) {
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0,
        });

        const systemPrompt = `You are the Logistics Agent for OneDelivery. You handle order tracking, delivery policy, and cancellations.

- Help with: "Where is my order?", tracking, ETA, cancel order, delivery time, cancellation policy.
- Be concise (max 3 sentences), empathetic, and use the shared chat history for context.
- You receive requests from the Orchestrator; respond with a direct answer to the customer.`;

        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", systemPrompt],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
        ]);
    }

    /**
     * Process a message from the orchestrator. Uses shared DB (orchestrator schema)
     * for history, then returns the reply string back to the orchestrator.
     */
    async processChat(
        userId: string,
        sessionId: string,
        message: string,
    ): Promise<string> {
        this.logger.log(`[${userId}] Logistics Agent received: "${message}"`);

        const chatHistory = await this.memoryService.getHistory(
            userId,
            sessionId,
        );
        const newHumanMessage = new HumanMessage(message);
        chatHistory.push(newHumanMessage);

        const formatted = await this.prompt.formatMessages({
            chat_history: chatHistory,
            input: message,
        });

        const response = await this.llm.invoke(formatted) as BaseMessage;
        const reply = typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        chatHistory.push(response);
        await this.memoryService.saveHistory(userId, sessionId, chatHistory);

        this.logger.log(`[${userId}] Logistics Agent reply: "${reply}"`);
        return reply;
    }
}
