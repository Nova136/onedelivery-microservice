import { Logger } from "@nestjs/common";
import { OrchestratorStateType } from "../state";

const logger = new Logger("SummarizationNode");

export const createSummarizationNode = () => {
    return async (state: OrchestratorStateType) => {
        logger.log(
            `Handling message truncation for session ${state.session_id}`,
        );

        let updatedMessages = [...state.messages];

        // Truncate messages if they get too long to save tokens in the graph state
        // The actual summarization is now handled by the service in the background
        if (updatedMessages.length > 10) {
            updatedMessages = updatedMessages.slice(-6);
        }

        return {
            messages: updatedMessages,
        };
    };
};
