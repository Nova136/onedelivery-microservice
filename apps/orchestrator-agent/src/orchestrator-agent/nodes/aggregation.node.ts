import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "@nestjs/common";
import { OrchestratorStateType } from "../state";

const AGGREGATOR_PROMPT = `
You are OneDelivery's AI customer support representative. 
Your task is to process internal system instructions and/or partial responses, and formulate a single, coherent, natural-sounding, and professional reply to the user.

### Guidelines:
1. **Professional & Empathetic Tone:** Maintain a helpful and friendly tone suitable for customer support.
2. **Translate Internal Terms:** DO NOT expose internal system terms or JSON. 
   - Translate intent codes (like 'REQUEST_REFUND', 'CANCEL_ORDER') into natural language (e.g., "your refund request", "cancelling your order").
   - Translate internal field names (like 'issueCategory', 'orderId', 'items') into conversational requests (e.g., "the reason for the issue", "your order number", "which items").
3. **Coherence:** If there are multiple instructions, combine them logically.
4. **Formatting:** Use clear formatting (like standard text bullet points) if confirming multiple gathered details to make it easy to read. DO NOT use markdown formatting like asterisks (**) for bolding or italics. Output strictly in plain text.

### System Instructions / Partial Responses:
{{partial_responses}}

### User Query:
{{user_query}}

Please provide the final aggregated response below:
`;

export interface AggregationDependencies {
    llm: BaseChatModel;
}

const logger = new Logger("AggregationNode");

export const createAggregationNode = (deps: AggregationDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Aggregating responses for session ${state.session_id}`);
        const { llm } = deps;

        let updatedMessages = [...state.messages];
        let isAwaitingConfirmation = state.is_awaiting_confirmation;
        let partialResponses = state.partial_responses;

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

            let finalResponse = "";
            try {
                const response = await llm.invoke([
                    { role: "system", content: prompt },
                ]);
                finalResponse = response.content.toString().trim();
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
            updatedMessages.push(new AIMessage(finalResponse));
            partialResponses = null;
        }

        return {
            messages: updatedMessages,
            partial_responses: partialResponses,
            is_awaiting_confirmation: isAwaitingConfirmation,
            decomposed_intents: [],
            has_truncated_intents: state.remaining_intents.length > 0,
        };
    };
};
