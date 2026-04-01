import { OrchestratorStateType } from "../state";
import { StructuredTool } from "@langchain/core/tools";
import { Logger } from "@nestjs/common";
import { SystemMessage } from "@langchain/core/messages";

const logger = new Logger("EndSessionNode");

export const createEndSessionNode = (tools: StructuredTool[]) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Processing state for session ${state.session_id}`);
    const endChatTool = tools.find(t => t.name === "End_Chat_Session");
    
    const messages = [];
    if (endChatTool) {
      try {
        await endChatTool.invoke({ userId: state.user_id, sessionId: state.session_id });
        messages.push(new SystemMessage("SYSTEM_ACTION: Tool End_Chat_Session executed successfully. The session has been closed."));
      } catch (e) {
        logger.error("End Session Tool Error:", e);
        messages.push(new SystemMessage("SYSTEM_ACTION: Tool End_Chat_Session failed, but session is closing."));
      }
    }

    return {
      messages,
      partial_responses: ["Thank you for contacting OneDelivery today! Your session has been closed. If you need further assistance in the future, please don't hesitate to reach out. Have a wonderful day!"],
    };
  };
};
