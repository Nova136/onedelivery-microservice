import { OrchestratorStateType } from "../state";
import { StructuredTool } from "@langchain/core/tools";
import { Logger } from "@nestjs/common";

const logger = new Logger("EndSessionNode");

export const createEndSessionNode = (tools: StructuredTool[]) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Processing state for session ${state.session_id}`);
    const endChatTool = tools.find(t => t.name === "End_Chat_Session");
    
    if (endChatTool) {
      try {
        await endChatTool.invoke({ userId: state.user_id, sessionId: state.session_id });
      } catch (e) {
        logger.error("End Session Tool Error:", e);
      }
    }

    return {
      partial_responses: ["Thank you for contacting OneDelivery today! Your session has been closed. If you need further assistance in the future, don't hesitate to reach out. Have a wonderful day!"],
    };
  };
};
