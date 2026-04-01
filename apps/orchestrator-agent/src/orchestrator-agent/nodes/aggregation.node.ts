import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { OrchestratorStateType } from "../state";
import { AGGREGATOR_PROMPT } from "../prompts/aggregation.prompt";

export interface AggregationDependencies {
    llm: BaseChatModel;
    llmFallback: BaseChatModel;
}

const logger = new Logger("AggregationNode");

export const createAggregationNode = (deps: AggregationDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Aggregating responses for session ${state.session_id}`);
        const { llm, llmFallback } = deps;

        let newMessages = [];
        let isAwaitingConfirmation = state.is_awaiting_confirmation;

        const partials = state.partial_responses || [];
        if (partials.length === 0) {
            const lastMessage = state.messages[state.messages.length - 1];
            if (!(lastMessage instanceof AIMessage && lastMessage.content)) {
                newMessages.push(
                    new AIMessage(
                        "I'm sorry, I'm not sure how to help with that. Could you please rephrase your request?",
                    ),
                );
            }
        } else {
            // Aggregate multiple partials using LLM
            const userQuery =
                ([...state.messages]
                    .reverse()
                    .find((m) => m instanceof HumanMessage)
                    ?.content as string) || "Unknown query";
            const partialsText = partials
                .map((p, i) => `Response ${i + 1}:\n${p}`)
                .join("\n\n---\n\n");

            let finalResponse = "";
            try {
                const schema = z.object({
                    thought: z
                        .string()
                        .describe("Reasoning for the aggregation"),
                    final_response: z
                        .string()
                        .describe("The final aggregated response text"),
                });
                const structuredLlm = llm.withStructuredOutput(schema);
                const structuredFallback =
                    llmFallback.withStructuredOutput(schema);
                const llmWithFallback = structuredLlm.withFallbacks({
                    fallbacks: [structuredFallback],
                });

                // Split prompt into system instructions and user data to avoid role confusion
                const systemPrompt =
                    AGGREGATOR_PROMPT.split("<input>")[0].trim();
                const userData =
                    `<input>${AGGREGATOR_PROMPT.split("<input>")[1]}`
                        .replace("{{partial_responses}}", partialsText)
                        .replace(
                            "{{gathered_data}}",
                            JSON.stringify(state.order_states || {}),
                        )
                        .replace("{{user_query}}", userQuery)
                        .trim();

                const response = (await llmWithFallback.invoke(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userData },
                    ],
                    {
                        runName: "Aggregator",
                    },
                )) as any;
                logger.log(`Aggregation Reasoning: ${response.thought}`);
                finalResponse = response.final_response;
            } catch (e) {
                logger.error("Aggregation failed:", e);
                // Fallback to simple concatenation
                finalResponse = partials.join("\n\n");
            }

            if (state.has_truncated_intents && !state.current_intent) {
                finalResponse +=
                    "\n\nI apologize, but I noticed you have several requests. I've addressed the first few above. Would you like to proceed with your remaining questions?";
                isAwaitingConfirmation = true;
            }
            newMessages.push(new AIMessage(finalResponse));
        }

        return {
            messages: newMessages,
            partial_responses: null,
            is_awaiting_confirmation: isAwaitingConfirmation,
            decomposed_intents: [],
            has_truncated_intents: state.remaining_intents.length > 0,
        };
    };
};
