import { OrchestratorStateType } from "../state";
import { DIALOGUE_PROMPTS } from "../prompts/sop.prompt";
import { Logger } from "@nestjs/common";

const logger = new Logger("ClarificationNode");

export const createClarificationNode = () => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Processing state for session ${state.session_id}`);
        
        // Use the fallback response prompt to guide the aggregator
        const clarificationPrompt = DIALOGUE_PROMPTS.FALLBACK_RESPONSE;

        return {
            partial_responses: [clarificationPrompt],
            current_intent: null, // Clear intent as it was unclear
        };
    };
};
