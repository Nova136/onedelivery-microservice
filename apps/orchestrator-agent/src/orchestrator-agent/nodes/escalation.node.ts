import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { Logger } from "@nestjs/common";
import { StructuredTool } from "@langchain/core/tools";

const logger = new Logger("EscalationNode");

export const createEscalationNode = (tools: StructuredTool[]) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Processing state for session ${state.session_id}`);
    
    let message = state.retry_count >= 2 
      ? "I'm having some trouble getting this right for you. To ensure you get the best assistance, I'm handing you over to one of our human specialists who can resolve this immediately."
      : "I understand this is a sensitive or complex matter. I'm connecting you with a human specialist who can help you further. Please stay on the line.";

    const escalateTool = tools.find(t => t.name === "Escalate_To_Human");
    
    const messages = [];
    if (escalateTool) {
      try {
        const toolResponse = await escalateTool.invoke({ 
          userId: state.user_id, 
          sessionId: state.session_id, 
          message: state.summary || "Escalation requested by user or system." 
        });
        message = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);
        messages.push(new SystemMessage("SYSTEM_ACTION: Tool Escalate_To_Human executed successfully. The user is being transferred to a human agent."));
      } catch (e) {
        logger.error("Escalation Tool Error:", e);
        messages.push(new SystemMessage("SYSTEM_ACTION: Tool Escalate_To_Human failed, but session is escalating."));
      }
    } else {
      messages.push(new SystemMessage("SYSTEM_ACTION: Escalation triggered successfully. The user is being transferred to a human agent."));
    }

    messages.push(new AIMessage(message));

    return {
      messages,
      partial_responses: null, // Clear any existing partials to avoid double messaging
      retry_count: 0, // Reset for next interaction if any
      is_human_managed: true,
    };
  };
};
