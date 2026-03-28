import { AIMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { Logger } from "@nestjs/common";

const logger = new Logger("EscalationNode");

export const createEscalationNode = () => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Processing state for session ${state.session_id}`);
    const reason = state.retry_count >= 2 ? "Max retries reached" : "Direct escalation";
    const message = state.retry_count >= 2 
      ? "I'm having some trouble getting this right for you. To ensure you get the best assistance, I'm handing you over to one of our human specialists who can resolve this immediately."
      : "I understand this is a sensitive or complex matter. I'm connecting you with a human specialist who can help you further. Please stay on the line.";

    return {
      messages: [new AIMessage(message)],
      partial_responses: null, // Clear any existing partials to avoid double messaging
      retry_count: 0, // Reset for next interaction if any
      layers: [{ name: "Escalation", status: "completed", data: reason }]
    };
  };
};
