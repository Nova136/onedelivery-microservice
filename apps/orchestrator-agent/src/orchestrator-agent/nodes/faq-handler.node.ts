import { AIMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredTool } from "@langchain/core/tools";
import { FAQ_SUMMARIZER_PROMPT } from "../prompts/faq-handler.prompt";
import { getSlidingWindowMessages } from "../utils/message-window";

export interface FaqHandlerDependencies {
    lightModel: ChatOpenAI;
    tools: StructuredTool[];
}

export const createFaqHandlerNode = (deps: FaqHandlerDependencies) => {
    return async (state: OrchestratorStateType) => {
        const { lightModel, tools } = deps;

        // Use sliding window for context
        const contextMessages = getSlidingWindowMessages(state.messages, 3);
        const lastMessage = state.messages[state.messages.length - 1];

        // Find the specific query for FAQ in decomposed_intents
        const faqIntent = state.decomposed_intents.find(
            (d) => d.category === "faq",
        );
        const query = faqIntent
            ? faqIntent.query
            : (lastMessage.content as string);

        const faqTool = tools.find((t) => t.name === "Search_FAQ");
        if (!faqTool) {
            return {
                messages: [
                    new AIMessage(
                        "I'm sorry, I'm having trouble accessing our FAQ system right now. How else can I help you?",
                    ),
                ],
                current_category: null,
                layers: [
                    {
                        name: "FAQ Handler",
                        status: "failed",
                        data: "FAQ tool not found",
                    },
                ],
            };
        }

        // 1. Always perform the search first (Saves 1 LLM call)
        let toolResult: any;
        try {
            toolResult = await faqTool.invoke({ query });
        } catch (e) {
            console.error("FAQ Tool execution error:", e);
            toolResult = "Error searching FAQ.";
        }

        // 2. Use a single LLM call to summarize the results for the user
        const finalResponse = await lightModel.invoke([
            { role: "system", content: FAQ_SUMMARIZER_PROMPT },
            ...contextMessages,
            {
                role: "user",
                content: `FAQ Search Results for "${query}":\n${JSON.stringify(toolResult)}`,
            },
        ]);

        return {
            messages: [new AIMessage(finalResponse.content as string)],
            current_category: null, // Reset category after handling
            current_intent: null,
            current_sop: null,
            intent_queue: [], // Clear queue as the summarizer is instructed to handle multiple questions
            layers: [
                {
                    name: "FAQ Handler",
                    status: "completed",
                    data: "Answered via direct FAQ search",
                },
            ],
        };
    };
};
