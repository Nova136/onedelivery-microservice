import { AIMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";

export const createEscalationNode = () => {
    return async (state: OrchestratorStateType) => {
        const reason =
            state.retry_count >= 2
                ? "Max retries reached"
                : "Direct escalation";
        const message =
            state.retry_count >= 2
                ? "I'm having some trouble getting this right for you. To ensure you get the best assistance, I'm handing you over to one of our human specialists who can resolve this immediately."
                : "I understand this is a sensitive or complex matter. I'm connecting you with a human specialist who can help you further. Please stay on the line.";

        return {
            messages: [new AIMessage(message)],
            current_category: null,
            retry_count: 0, // Reset for next interaction if any
            layers: [{ name: "Escalation", status: "completed", data: reason }],
        };
    };
};
