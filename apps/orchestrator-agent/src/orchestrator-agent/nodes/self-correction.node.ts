import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { SELF_CORRECTION_PROMPT } from "../prompts/self-correction.prompt";
import { formatOrders } from "../utils/format-orders";

export const createSelfCorrectionNode = (strongModel: ChatOpenAI) => {
    return async (state: OrchestratorStateType) => {
        console.log(
            `SelfCorrectionNode: processing state for session ${state.session_id}`,
        );
        const evaluation = state.last_evaluation;
        if (!evaluation || evaluation.isSafe) return {};

        const lastAIMessage = state.messages[state.messages.length - 1];
        const content = lastAIMessage.content as string;

        const lastHumanMessage = [...state.messages]
            .reverse()
            .find((m) => m instanceof HumanMessage);
        const input = lastHumanMessage
            ? (lastHumanMessage.content as string)
            : "";

        const userContext =
            state.user_orders.length > 0
                ? `<user_orders>\n${formatOrders(state.user_orders)}\n</user_orders>`
                : "No recent orders found.";
        const summaryContext = state.summary
            ? `<summary>\n${state.summary}\n</summary>`
            : "No previous conversation summary.";
        const orderStatesContext = `<current_states>\n${JSON.stringify(state.order_states, null, 2)}\n</current_states>`;

        const correctionPrompt = SELF_CORRECTION_PROMPT.replace(
            "{{issues}}",
            evaluation.issues?.join("\n") || "No specific issues listed.",
        )
            .replace("{{isHallucination}}", String(evaluation.isHallucination))
            .replace("{{isLeakage}}", String(evaluation.isLeakage))
            .replace("{{summary}}", summaryContext)
            .replace("{{user_context}}", userContext)
            .replace("{{current_order_states}}", orderStatesContext)
            .replace("{{input}}", input)
            .replace("{{content}}", content);

        const response = await strongModel.invoke([
            { role: "system", content: correctionPrompt },
        ]);

        const updatedMessages = [...state.messages];
        updatedMessages[updatedMessages.length - 1] = new AIMessage(
            response.content as string,
        );

        return {
            messages: updatedMessages,
            retry_count: state.retry_count + 1,
            layers: [
                {
                    name: "Self-Correction",
                    status: "completed",
                    data: `Retry ${state.retry_count + 1}`,
                },
            ],
        };
    };
};
