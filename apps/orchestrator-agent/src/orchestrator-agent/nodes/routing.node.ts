import { OrchestratorStateType } from "../state";
import { SemanticRouterService } from "../../modules/semantic-router/semantic-router.service";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";
import { ChatOpenAI } from "@langchain/openai";
import { getSlidingWindowMessages } from "../utils/message-window";

export interface RoutingDependencies {
    semanticRouter: SemanticRouterService;
    knowledgeClient: KnowledgeClientService;
    lightModel: ChatOpenAI;
}

export const createRoutingNode = (deps: RoutingDependencies) => {
    return async (state: OrchestratorStateType) => {
        console.log(
            `RoutingNode: processing state for session ${state.session_id}`,
        );
        const { semanticRouter, knowledgeClient, lightModel } = deps;

        // Use sliding window for context
        const contextMessages = getSlidingWindowMessages(state.messages, 3); // Routing needs less context

        // 1. Semantic Routing (Broad Category)
        // Only be sticky for SOP categories (resolution, logistics) to allow topic switching for general/faq
        if (
            state.current_category &&
            (state.current_category === "cancel_order" ||
                state.current_category === "request_refund")
        ) {
            return {};
        }

        const lastMessage = state.messages[state.messages.length - 1];
        const content = lastMessage.content as string;

        // 1b. Handle Continuation if we were awaiting confirmation
        if (
            state.is_awaiting_confirmation &&
            state.remaining_intents.length > 0
        ) {
            // Use LLM to check if the user said "yes" to proceed
            const checkPrompt = `The user was asked if they want to proceed with their remaining questions.
User message: "${content}"
Does the user want to proceed? Answer ONLY "YES" or "NO".`;

            const checkResponse = await lightModel.invoke([
                { role: "system", content: checkPrompt },
            ]);

            const wantsToProceed =
                checkResponse.content.toString().trim().toUpperCase() === "YES";

            if (wantsToProceed) {
                const nextBatch = state.remaining_intents.slice(0, 3);
                const furtherRemaining = state.remaining_intents.slice(3);
                const hasTruncated = furtherRemaining.length > 0;

                const category = nextBatch[0]?.category || "general";
                const intentCode = nextBatch[0]?.intent || "GENERAL_QUERY";
                const intentQueue = nextBatch.slice(1);

                return {
                    current_category: category,
                    current_intent: intentCode,
                    current_intent_index: 0,
                    intent_queue: intentQueue,
                    decomposed_intents: nextBatch,
                    remaining_intents: furtherRemaining,
                    has_truncated_intents: hasTruncated,
                    is_awaiting_confirmation: false,
                    layers: [
                        {
                            name: "Routing",
                            status: "completed",
                            data: `Continued with ${nextBatch.length} remaining intents`,
                        },
                    ],
                };
            } else {
                // User said no or something else, reset the confirmation flag and remaining intents
                // but continue to normal classification below
                state.is_awaiting_confirmation = false;
                state.remaining_intents = [];
            }
        }

        const { categories, decomposed } =
            await semanticRouter.classifyCategory(
                contextMessages,
                state.summary,
                state.user_orders,
            );

        // 2. Prioritization and Queueing Logic
        const priorityOrder = [
            "escalate",
            "cancel_order",
            "request_refund",
            "faq",
            "general",
            "end_session",
        ];

        // Sort decomposed intents based on priority
        const sortedDecomposed = [...decomposed].sort((a, b) => {
            const indexA = priorityOrder.indexOf(a.category);
            const indexB = priorityOrder.indexOf(b.category);
            return (
                (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB)
            );
        });

        const hasTruncated = sortedDecomposed.length > 3;
        const limitedDecomposed = sortedDecomposed.slice(0, 3);
        const remainingIntents = sortedDecomposed.slice(3);

        const category = limitedDecomposed[0]?.category || "general";
        const intentCode = limitedDecomposed[0]?.intent || "GENERAL_QUERY";
        const intentQueue = limitedDecomposed.slice(1);

        return {
            current_category: category,
            current_intent: intentCode,
            current_intent_index: 0,
            intent_queue: intentQueue,
            decomposed_intents: limitedDecomposed,
            remaining_intents: remainingIntents,
            has_truncated_intents: hasTruncated,
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
