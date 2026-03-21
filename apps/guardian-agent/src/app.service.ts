import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { BaseMessage } from "@langchain/core/messages";
// import { HumanMessage } from "@langchain/core/messages";
// import { MemoryService } from "./memory/memory.service";
import { KnowledgeClientService } from "./knowledge/knowledge-client.service";

/**
 * Guardian specialist agent. Invoked by the orchestrator via TCP (agent.chat).
 * Processes safety concerns, account/security issues, and escalations. Responds
 * back to the orchestrator with a string reply (no routing tools).
 */
@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);
    private readonly llm: ChatOpenAI;
    private readonly prompt: ChatPromptTemplate;

    constructor(
        // private memoryService: MemoryService,
        private knowledgeClient: KnowledgeClientService,
    ) {
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0,
        });

//         const systemPrompt = `You are the Guardian Agent for OneDelivery. You handle safety concerns, account/security issues, and escalations.

// - Help with: safety concerns, account or security issues, complaints needing oversight, policy enforcement, escalation.
// - Be concise (max 3 sentences), calm, and use the shared chat history for context.
// - You receive requests from the Orchestrator; respond with a direct answer to the customer.`;

        const systemPrompt = `You are the Guardian Agent for OneDelivery. You serve two roles:

        ## ROLE 1: SOP VERIFICATION (Internal)
        When you receive a message starting with "Verify this", you are validating an internal decision before it reaches the customer.
        - Check if the proposed response is accurate, follows policy, and contains no hallucinated data
        - If approved: return the proposed response exactly as-is, with no changes
        - If rejected: return a corrected version prefixed with "CORRECTED: " and explain what was wrong at the end in brackets

        ## ROLE 2: ESCALATION (Customer-facing)
        When you receive a safety concern, security issue, or complaint needing oversight:
        - Respond directly to the customer
        - Be concise (max 3 sentences), calm, and empathetic
        - Use the shared chat history for context

        ## RULES
        - Never reveal internal tool names or SOP details to the customer
        - Never guess or make up policy limits
        - If unsure whether to approve, reject rather than guess`;

        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", systemPrompt + "\n\n{sop}"],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
        ]);
    }

    /**
     * Process a message from the orchestrator. Stateless — no history stored.
     * Returns the reply string back to the orchestrator.
     */
    async processChat(
        userId: string,
        sessionId: string,
        message: string,
    ): Promise<string> {
        this.logger.log(`[${userId}] Guardian Agent received: "${message}"`);

        const isVerification = message.startsWith("Verify this");

        // Guardian is stateless — history is owned by the orchestrator.
        // const chatHistory: BaseMessage[] = isVerification
        //     ? []
        //     : await this.memoryService.getHistory(userId, sessionId);
        // const newHumanMessage = new HumanMessage(message);

        let sopContext = "";
        if (isVerification) {
            sopContext = await this.knowledgeClient.searchInternalSop({
                intentCode: "VERIFICATION",
                requestingAgent: "guardian_agent",
            });
        }

        const formatted = await this.prompt.formatMessages({
            chat_history: [],
            input: message,
            sop: sopContext ? `## SOP REFERENCE\n${sopContext}` : "",
        });

        const response = await this.llm.invoke(formatted) as BaseMessage;
        const reply = typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        // if (!isVerification) {
        //     chatHistory.push(newHumanMessage);
        //     chatHistory.push(response);
        //     await this.memoryService.saveHistory(userId, sessionId, chatHistory);
        // }

        this.logger.log(`[${userId}] Guardian Agent reply: "${reply}"`);
        return reply;
    }
}
