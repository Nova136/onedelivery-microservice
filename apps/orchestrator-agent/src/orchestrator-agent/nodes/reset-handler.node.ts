import { OrchestratorStateType } from "../state";
import { Logger } from "@nestjs/common";

const logger = new Logger("ResetHandlerNode");

export const createResetHandlerNode = () => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Resetting state for session ${state.session_id}`);

        // Clear task-specific state but keep conversation history and user info
        return {
            current_intent: null,
            current_sop: null,
            order_states: null,
            is_awaiting_confirmation: false,
            multi_intent_acknowledged: false,
            decomposed_intents: [],
            partial_responses: [
                "No problem. I've cleared your previous request. How else can I help you today?",
            ],
        };
    };
};
