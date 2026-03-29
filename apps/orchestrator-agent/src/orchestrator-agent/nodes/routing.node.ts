import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "@nestjs/common";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";
import { SemanticRouterService } from "../../modules/semantic-router/semantic-router.service";
import { OrchestratorStateType } from "../state";
import { getSlidingWindowMessages } from "../utils/message-window";

const ROUTING_PROMPTS = {
    CHECK_PROMPT: `The user was asked if they want to proceed with their remaining questions.
User message: "{{content}}"
Does the user want to proceed? Answer ONLY "YES" or "NO".`,
};

export interface RoutingDependencies {
    semanticRouter: SemanticRouterService;
    llm: BaseChatModel;
    knowledgeClient: KnowledgeClientService;
}

const logger = new Logger("RoutingNode");

export const createRoutingNode = (deps: RoutingDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Processing state for session ${state.session_id}`);
        const { semanticRouter, llm, knowledgeClient } = deps;

        // Use sliding window for context
        const contextMessages = getSlidingWindowMessages(state.messages, 3); // Routing needs less context

        // 1. Semantic Routing (Intent Classification)
        const lastMessage = state.messages[state.messages.length - 1];
        const content = lastMessage.content as string;

        let isAwaitingConfirmation = state.is_awaiting_confirmation;
        let remainingIntents = state.remaining_intents;
        let hasTruncated = state.has_truncated_intents;

        const sopIntents = knowledgeClient
            .listOrchestratorSops()
            .then((sops) => sops.map((s) => s.intentCode));

        // Helper to ensure at most ONE SOP intent is processed at a time
        const ensureSingleSop = async (intents: any[]) => {
            const sopCodes = await sopIntents;
            let foundSop = false;
            const finalDecomposed = [];
            const finalRemaining = [];

            for (const intentObj of intents) {
                if (sopCodes.includes(intentObj.intent)) {
                    if (!foundSop) {
                        finalDecomposed.push(intentObj);
                        foundSop = true;
                    } else {
                        finalRemaining.push(intentObj);
                    }
                } else {
                    finalDecomposed.push(intentObj);
                }
            }
            return { finalDecomposed, finalRemaining };
        };

        // 1b. Handle Continuation if we were awaiting confirmation
        if (isAwaitingConfirmation && remainingIntents.length > 0) {
            // Use LLM to check if the user said "yes" to proceed
            const checkPrompt = ROUTING_PROMPTS.CHECK_PROMPT.replace(
                "{{content}}",
                content,
            );

            let wantsToProceed = false;
            try {
                const checkResponse = await llm.invoke([
                    { role: "system", content: checkPrompt },
                ]);
                wantsToProceed =
                    checkResponse.content.toString().trim().toUpperCase() ===
                    "YES";
            } catch (e) {
                logger.error("All models failed for Routing confirmation:", e);
                // Default to NO if both fail
                wantsToProceed = false;
            }

            if (wantsToProceed) {
                const { finalDecomposed, finalRemaining } =
                    await ensureSingleSop(remainingIntents);
                const nextBatch = finalDecomposed.slice(0, 3);
                const furtherRemaining = [
                    ...finalDecomposed.slice(3),
                    ...finalRemaining,
                ];
                const newHasTruncated = furtherRemaining.length > 0;

                return {
                    decomposed_intents: nextBatch,
                    remaining_intents: furtherRemaining,
                    has_truncated_intents: newHasTruncated,
                    is_awaiting_confirmation: false,
                };
            } else {
                // User said no or something else, reset the confirmation flag and remaining intents
                // but continue to normal classification below
                isAwaitingConfirmation = false;
                remainingIntents = [];
                hasTruncated = false;
            }
        }

        const currentTask = state.current_intent || "None";
        const { intents, decomposed } = await semanticRouter.classifyIntents(
            contextMessages,
            state.summary,
            state.user_orders,
            currentTask,
        );

        // 2. Prioritization and Queueing Logic
        const staticHighPriority = [
            "reset",
            "escalate",
            "faq",
            "general",
            "end_session",
        ];
        const staticLowPriority = [
            "reset",
            "escalate",
            "faq",
            "general",
            "end_session",
        ];
        const sopCodes = await sopIntents;
        const priorityOrder = [
            ...staticHighPriority,
            ...sopCodes,
            ...staticLowPriority,
        ];

        // Sort decomposed intents based on priority
        const sortedDecomposed = [...decomposed].sort((a, b) => {
            const indexA = priorityOrder.indexOf(a.intent);
            const indexB = priorityOrder.indexOf(b.intent);
            return (
                (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB)
            );
        });

        const { finalDecomposed, finalRemaining } =
            await ensureSingleSop(sortedDecomposed);
        const limitedDecomposed = finalDecomposed.slice(0, 3);
        const newRemainingIntents = [
            ...finalDecomposed.slice(3),
            ...finalRemaining,
        ];
        const newHasTruncated = newRemainingIntents.length > 0;

        return {
            decomposed_intents: limitedDecomposed,
            remaining_intents: newRemainingIntents,
            has_truncated_intents: newHasTruncated,
            multi_intent_acknowledged: false,
            is_awaiting_confirmation: isAwaitingConfirmation,
        };
    };
};
