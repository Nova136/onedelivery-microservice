import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { SummarizerService } from "../../modules/summarizer/summarizer.service";
import { Logger } from "@nestjs/common";

const AGGREGATOR_PROMPT = `
You are an AI response aggregator. Your task is to combine multiple partial responses into a single, coherent, and natural-sounding reply to the user.

### Guidelines:
1. **Coherence:** Ensure the final response flows logically.
2. **Conciseness:** Avoid redundant phrases or repeated greetings.
3. **Tone:** Maintain a professional, helpful, and friendly tone.
4. **Completeness:** Do not omit any important information from the partial responses.
5. **Formatting:** Use clear formatting (like bullet points or numbered lists) if it helps readability.

### Partial Responses to Aggregate:
{{partial_responses}}

### User Query:
{{user_query}}

Please provide the final aggregated response below:
`;

export interface PostProcessingDependencies {
    summarizer: SummarizerService;
    lightModel: ChatOpenAI;
}

const logger = new Logger("PostProcessingNode");

export const createPostProcessingNode = (deps: PostProcessingDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Processing state for session ${state.session_id}`);
        const { summarizer, lightModel } = deps;

        let updatedMessages = [...state.messages];
        let layers = [];
        let isAwaitingConfirmation = state.is_awaiting_confirmation;
        let partialResponses = state.partial_responses;

        // --- 1. Aggregation ---
        const partials = state.partial_responses || [];
        if (partials.length === 0) {
            const lastMessage = updatedMessages[updatedMessages.length - 1];
            if (!(lastMessage instanceof AIMessage && lastMessage.content)) {
                updatedMessages.push(
                    new AIMessage(
                        "I'm sorry, I'm not sure how to help with that. Could you please rephrase your request?",
                    ),
                );
            }
            partialResponses = null;
        } else if (partials.length === 1) {
            let finalResponse = partials[0];
            if (state.has_truncated_intents && !state.current_category) {
                finalResponse +=
                    "\n\nI apologize, but I noticed you have several requests. I've addressed the first one above. Would you like to proceed with your remaining questions?";
                isAwaitingConfirmation = true;
                layers.push({
                    name: "Post-Processing",
                    status: "completed",
                    data: "Single response, intents truncated",
                });
            } else {
                layers.push({
                    name: "Post-Processing",
                    status: "completed",
                    data: "Single response, no aggregation needed",
                });
            }
            updatedMessages.push(new AIMessage(finalResponse));
            partialResponses = null;
        } else {
            // Aggregate multiple partials using LLM
            const userQuery =
                ([...updatedMessages]
                    .reverse()
                    .find((m) => m instanceof HumanMessage)
                    ?.content as string) || "Unknown query";
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

            let finalResponse = response.content.toString().trim();

            if (state.has_truncated_intents && !state.current_category) {
                finalResponse +=
                    "\n\nI apologize, but I noticed you have several requests. I've addressed the first few above. Would you like to proceed with your remaining questions?";
                isAwaitingConfirmation = true;
                layers.push({
                    name: "Post-Processing",
                    status: "completed",
                    data: `Aggregated ${partials.length} responses, intents truncated`,
                });
            } else {
                layers.push({
                    name: "Post-Processing",
                    status: "completed",
                    data: `Aggregated ${partials.length} responses using LLM`,
                });
            }
            updatedMessages.push(new AIMessage(finalResponse));
            partialResponses = null;
        }

        // --- 2. Summarization ---
        let newSummary = state.summary;
        if (updatedMessages.length > 6) {
            try {
                newSummary = await summarizer.summarize(
                    updatedMessages.slice(0, -4),
                    state.summary,
                );
                updatedMessages = updatedMessages.slice(-4);
            } catch (e) {
                logger.error("Summarization Error:", e);
            }
        }

        layers.push({
            name: "Post-Processing",
            status: "completed",
            data: "Summarization complete",
        });

        return {
            messages: updatedMessages,
            summary: newSummary,
            partial_responses: partialResponses,
            is_awaiting_confirmation: isAwaitingConfirmation,
            layers,
        };
    };
};
