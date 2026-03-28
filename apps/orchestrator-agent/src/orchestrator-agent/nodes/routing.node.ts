import { OrchestratorStateType } from "../state";
import { SemanticRouterService } from "../../modules/semantic-router/semantic-router.service";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";
import { ChatOpenAI } from "@langchain/openai";
import { SOP_INTENT_CLASSIFIER_PROMPT } from "../prompts/sop-intent-classifier.prompt";
import { getSlidingWindowMessages } from "../utils/message-window";
import { formatOrders } from "../utils/format-orders";

export interface RoutingDependencies {
    semanticRouter: SemanticRouterService;
    knowledgeClient: KnowledgeClientService;
    lightModel: ChatOpenAI;
}

export const createRoutingNode = (deps: RoutingDependencies) => {
    return async (state: OrchestratorStateType) => {
        const { semanticRouter, knowledgeClient, lightModel } = deps;

        // Use sliding window for context
        const contextMessages = getSlidingWindowMessages(state.messages, 3); // Routing needs less context

        // 1. Semantic Routing (Broad Category)
        // Only be sticky for SOP categories (resolution, logistics) to allow topic switching for general/faq
        if (
            state.current_category &&
            (state.current_category === "resolution" ||
                state.current_category === "logistics")
        ) {
            return {};
        }

        const { categories, decomposed } =
            await semanticRouter.classifyCategory(
                contextMessages,
                state.summary,
                state.user_orders,
            );

        // Prioritize FAQ if it's in the list, as it has a specialized handler
        let category = categories[0] || "general";
        let intentQueue = categories.slice(1);

        if (categories.includes("faq") && category !== "faq") {
            category = "faq";
            intentQueue = categories.filter((c) => c !== "faq");
        }

        // 2. Intent Classification (if applicable)
        let intentCode = "GENERAL_QUERY";
        const lastMessage = state.messages[state.messages.length - 1];
        const content = lastMessage.content as string;

        if (category === "resolution" || category === "logistics") {
            const categoryIntents =
                knowledgeClient.getIntentsByCategory(category);
            const intentsList =
                categoryIntents.length > 0
                    ? categoryIntents
                          .map((s) => `- ${s.id}: ${s.description}`)
                          .join("\n")
                    : "- GENERAL_QUERY: General customer service query.";

            const userContext =
                state.user_orders.length > 0
                    ? `<user_orders>\n${formatOrders(state.user_orders)}\n</user_orders>`
                    : "No recent orders found.";
            const summaryContext = state.summary
                ? `<summary>\n${state.summary}\n</summary>`
                : "No previous conversation summary.";

            const intentPrompt = SOP_INTENT_CLASSIFIER_PROMPT.replace(
                "{{category}}",
                category,
            )
                .replace("{{available_intents}}", intentsList)
                .replace("{{user_context}}", userContext)
                .replace("{{summary}}", summaryContext);

            const intentResponse = await lightModel.invoke([
                { role: "system", content: intentPrompt },
                ...contextMessages,
            ]);

            intentCode = intentResponse.content.toString().trim().toUpperCase();
        }

        return {
            current_category: category,
            current_intent: intentCode,
            intent_queue: intentQueue,
            decomposed_intents: decomposed,
            multi_intent_acknowledged: false,
            is_awaiting_confirmation: false,
            layers: [
                {
                    name: "Routing",
                    status: "completed",
                    data: `Category: ${category} | Intent: ${intentCode}`,
                },
            ],
        };
    };
};
