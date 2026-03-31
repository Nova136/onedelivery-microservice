import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";
import { IntentClassifierService } from "../../modules/intent-classifier/intent-classifier.service";
import { OrchestratorStateType } from "../state";
import { getSlidingWindowMessages } from "../utils/message-window";
import { ROUTING_PROMPTS } from "../prompts/routing.prompt";

export interface RoutingDependencies {
    intentClassifier: IntentClassifierService;
    llm: BaseChatModel;
    llmFallback: BaseChatModel;
    knowledgeClient: KnowledgeClientService;
}

const logger = new Logger("RoutingNode");

export const createRoutingNode = (deps: RoutingDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Processing state for session ${state.session_id}`);
        const { intentClassifier, llm, llmFallback, knowledgeClient } = deps;

        // Use sliding window for context
        const contextMessages = getSlidingWindowMessages(state.messages, 3); // Routing needs less context

        // 1. Intent Classification
        let isAwaitingConfirmation = state.is_awaiting_confirmation;
        let remainingIntents = state.remaining_intents;

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
            let wantsToProceed = false;
            try {
                const schema = z.object({
                    thought: z.string().describe("Reasoning for the decision"),
                    wants_to_proceed: z
                        .boolean()
                        .describe("Whether the user wants to proceed"),
                });
                const structuredLlm = llm.withStructuredOutput(schema);
                const structuredFallback =
                    llmFallback.withStructuredOutput(schema);
                const llmWithFallback = structuredLlm.withFallbacks({
                    fallbacks: [structuredFallback],
                });

                // Split prompt into system instructions and user data to avoid role confusion
                const systemPrompt =
                    ROUTING_PROMPTS.CHECK_PROMPT.split("<input>")[0].trim() +
                    "\n\n" +
                    ROUTING_PROMPTS.CHECK_PROMPT.split("</input>")[1].trim();
                const userData =
                    `<input>${ROUTING_PROMPTS.CHECK_PROMPT.split("<input>")[1].split("</input>")[0]}</input>`
                        .replace(
                            "{{content}}",
                            state.messages[
                                state.messages.length - 1
                            ].content.toString(),
                        )
                        .trim();

                const checkResponse = (await llmWithFallback.invoke([
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userData },
                ])) as any;
                logger.log(
                    `Routing Confirmation Reasoning: ${checkResponse.thought}`,
                );
                wantsToProceed = checkResponse.wants_to_proceed;
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
            }
        }

        const currentTask = state.current_intent || "None";
        const { decomposed } = await intentClassifier.classifyIntents(
            contextMessages,
            state.summary,
            state.user_orders,
            currentTask,
        );

        // 2. Prioritization and Queueing Logic
        const staticHighPriority = [
            "reset",
            "escalate",
            "confirmation",
            "faq",
            "general",
            "end_session",
        ];

        // Handle stray confirmations (user says "yes" but we didn't ask anything)
        const validatedDecomposed = decomposed.map((d) => {
            if (
                d.intent === "confirmation" &&
                !isAwaitingConfirmation &&
                !state.current_intent
            ) {
                logger.warn(
                    "Stray confirmation detected. Routing to 'general' for clarification.",
                );
                return { ...d, intent: "general" };
            }
            return d;
        });

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
        const sortedDecomposed = [...validatedDecomposed].sort((a, b) => {
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
