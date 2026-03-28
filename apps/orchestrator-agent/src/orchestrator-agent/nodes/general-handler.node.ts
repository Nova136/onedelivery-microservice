import { AIMessage } from "@langchain/core/messages";
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

        const response = await lightModel.invoke([
            { role: "system", content: systemPrompt },
            ...contextMessages,
        ]);

        return {
            messages: [new AIMessage(response.content as string)],
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
