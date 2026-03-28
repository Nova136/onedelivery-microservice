import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { AGGREGATOR_PROMPT } from "../prompts/aggregator.prompt";

export interface AggregatorDependencies {
    lightModel: ChatOpenAI;
}

/**
 * Node to aggregate all partial responses into a single AIMessage using an LLM.
 */
export const createAggregatorNode = (deps: AggregatorDependencies) => {
    return async (state: OrchestratorStateType) => {
        console.log(
            `AggregatorNode: processing state for session ${state.session_id}`,
        );
        const { lightModel } = deps;
        const partials = state.partial_responses || [];

        if (partials.length === 0) {
            // If we have no partials, check if we have any messages from the handlers already
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage instanceof AIMessage && lastMessage.content) {
                return {
                    partial_responses: null,
                    layers: [
                        {
                            name: "Aggregator",
                            status: "completed",
                            data: "Used existing AIMessage",
                        },
                    ],
                };
            }

            return {
                messages: [
                    new AIMessage(
                        "I'm sorry, I'm not sure how to help with that. Could you please rephrase your request?",
                    ),
                ],
            };
        }

        // If there's only one partial response, we don't necessarily need the LLM to aggregate,
        // but for consistency and to ensure a good final tone, we can still use it or just return it.
        // Let's use the LLM if there are multiple partials.
        if (partials.length === 1) {
            let finalResponse = partials[0];
            if (state.has_truncated_intents) {
                finalResponse +=
                    "\n\nI apologize, but I noticed you have several requests. I've addressed the first one above. Would you like to proceed with your remaining questions?";
                return {
                    messages: [new AIMessage(finalResponse)],
                    partial_responses: null,
                    is_awaiting_confirmation: true,
                    layers: [
                        {
                            name: "Aggregator",
                            status: "completed",
                            data: "Single response, intents truncated",
                        },
                    ],
                };
            }
            return {
                messages: [new AIMessage(finalResponse)],
                partial_responses: null,
                has_truncated_intents: false,
                layers: [
                    {
                        name: "Aggregator",
                        status: "completed",
                        data: "Single response, no aggregation needed",
                    },
                ],
            };
        }

        // Aggregate multiple partials using LLM
        const userQuery =
            ([...state.messages]
                .reverse()
                .find((m) => m instanceof HumanMessage)?.content as string) ||
            "Unknown query";
        const partialsText = partials
            .map((p, i) => `Response ${i + 1}:\n${p}`)
            .join("\n\n---\n\n");

        const prompt = AGGREGATOR_PROMPT.replace(
            "{{partial_responses}}",
            partialsText,
        ).replace("{{user_query}}", userQuery);

        const response = await lightModel.invoke([
            { role: "system", content: prompt },
        ]);

        const combined = response.content.toString().trim();

        // Add truncation notice if needed
        let finalResponse = combined;
        if (state.has_truncated_intents) {
            finalResponse +=
                "\n\nI apologize, but I noticed you have several requests. I've addressed the first few above. Would you like to proceed with your remaining questions?";
            return {
                messages: [new AIMessage(finalResponse)],
                partial_responses: null, // Clear for next turn
                is_awaiting_confirmation: true,
                layers: [
                    {
                        name: "Aggregator",
                        status: "completed",
                        data: `Aggregated ${partials.length} responses, intents truncated`,
                    },
                ],
            };
        }

        return {
            messages: [new AIMessage(finalResponse)],
            partial_responses: null, // Clear for next turn
            has_truncated_intents: false, // Reset
            layers: [
                {
                    name: "Aggregator",
                    status: "completed",
                    data: `Aggregated ${partials.length} responses using LLM`,
                },
            ],
        };
    };
};
