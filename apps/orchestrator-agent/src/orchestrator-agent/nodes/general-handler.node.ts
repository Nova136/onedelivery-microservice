import { OrchestratorStateType } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredTool } from "@langchain/core/tools";
import { GENERAL_HANDLER_PROMPT } from "../prompts/general-handler.prompt";
import { getSlidingWindowMessages } from "../utils/message-window";
import { formatOrders } from "../utils/format-orders";

export interface GeneralHandlerDependencies {
    lightModel: ChatOpenAI;
    tools: StructuredTool[];
}

export const createGeneralHandlerNode = (deps: GeneralHandlerDependencies) => {
    return async (state: OrchestratorStateType) => {
        console.log(
            `GeneralHandlerNode: processing state for session ${state.session_id}`,
        );
        const { lightModel, tools } = deps;

        // Use sliding window for context
        const contextMessages = getSlidingWindowMessages(state.messages, 5);

        const userContext =
            state.user_orders.length > 0
                ? `<user_orders>\n${formatOrders(state.user_orders)}\n</user_orders>`
                : "No recent orders found.";
        const summaryContext = state.summary
            ? `<summary>\n${state.summary}\n</summary>`
            : "No previous conversation summary.";

        const sessionContext = `<session_context>\nUser ID: ${state.user_id}\nSession ID: ${state.session_id}\n</session_context>`;

        const systemPrompt = GENERAL_HANDLER_PROMPT.replace(
            "{{userContext}}",
            userContext,
        )
            .replace("{{summaryContext}}", summaryContext)
            .replace("{{sessionContext}}", sessionContext);

        // Find the specific query for General in decomposed_intents using the current index
        const generalIntent =
            state.decomposed_intents[state.current_intent_index];
        const lastMessage = state.messages[state.messages.length - 1];
        const query =
            generalIntent && generalIntent.category === "general"
                ? generalIntent.query
                : (lastMessage.content as string);

        const response = await lightModel.invoke([
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
        ]);

        return {
            partial_responses: [response.content as string],
            current_category: null, // Reset category after handling
            current_intent: null,
            current_sop: null,
            layers: [
                {
                    name: "General Handler",
                    status: "completed",
                    data: "Handled general inquiry",
                },
            ],
        };
    };
};
