import { AIMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { PromptShieldService } from "../../modules/prompt-shield/prompt-shield.service";

export interface PromptShieldNodeDependencies {
    promptShield: PromptShieldService;
}

export const createPromptShieldNode = (deps: PromptShieldNodeDependencies) => {
    return async (state: OrchestratorStateType) => {
        const { promptShield } = deps;
        const lastMessage = state.messages[state.messages.length - 1];
        const content = lastMessage?.content?.toString() || "";

        const isSuspicious = await promptShield.isSuspicious(content);

        if (isSuspicious) {
            const pivotMessage = "I'm sorry, I'm specialized in assisting with OneDelivery's services and don't have information regarding my internal operations or out-of-scope topics. I'd be happy to help you with your orders or our delivery policies instead. What can I do for you today?";
            return {
                messages: [...state.messages, new AIMessage(pivotMessage)],
                is_input_valid: false,
            };
        }

        return {
            is_input_valid: state.is_input_valid,
        };
    };
};
