import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { SEMANTIC_ROUTER_PROMPT } from "./prompts/semantic-router.prompt";

@Injectable()
export class SemanticRouterService {
    private readonly logger = new Logger(SemanticRouterService.name);
    private llm: ChatOpenAI;

    constructor() {
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0,
        });
    }

    async classifyIntent(
        userId: string,
        userMessage: string,
        lastAiMessage: string,
    ): Promise<{ intent: string; activeToolNames: string[] }> {
        this.logger.log(`[${userId}] Semantic Routing Intent...`);

        const routerPrompt = ChatPromptTemplate.fromMessages([
            ["system", SEMANTIC_ROUTER_PROMPT],
            ["human", "{userMessage}"],
        ]);

        const response = await this.llm.invoke(
            await routerPrompt.formatMessages({
                userMessage: userMessage,
                lastAiMessage: lastAiMessage,
            }),
        );
        const intentRaw = String(response.content).trim();
        this.logger.log(`[${userId}] Intent Classified: ${intentRaw}`);

        let primaryIntent = "UNKNOWN"; // Default fallback
        if (intentRaw.includes("ESCALATE")) primaryIntent = "ESCALATE";
        else if (intentRaw.includes("END_SESSION"))
            primaryIntent = "END_SESSION";
        else if (intentRaw.includes("ACTION")) primaryIntent = "ACTION";
        else if (intentRaw.includes("FAQ")) primaryIntent = "FAQ";

        const initialTools: string[] = [];
        if (primaryIntent === "FAQ") initialTools.push("Search_FAQ");
        if (primaryIntent === "ACTION")
            initialTools.push("Search_Internal_SOP");
        if (primaryIntent === "END_SESSION")
            initialTools.push("End_Chat_Session");
        if (primaryIntent === "ESCALATE")
            initialTools.push("Escalate_To_Human");

        return { intent: primaryIntent, activeToolNames: initialTools };
    }
}
