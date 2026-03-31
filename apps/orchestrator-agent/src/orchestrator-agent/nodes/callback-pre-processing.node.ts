import { AgentCallbackStateType } from "../agent-callback.state";
import { PiiRedactionService } from "../../modules/pii-redaction/pii-redaction.service";
import { PromptShieldService } from "../../modules/prompt-shield/prompt-shield.service";

export interface CallbackPreProcessingDependencies {
    piiService: PiiRedactionService;
    promptShield: PromptShieldService;
}

export const createCallbackPreProcessingNode = (deps: CallbackPreProcessingDependencies) => {
    return async (state: AgentCallbackStateType) => {
        const { piiService, promptShield } = deps;

        const redacted = await piiService.redact(state.agent_message);
        const isSuspicious = await promptShield.isSuspicious(redacted);

        let finalRedacted = redacted;
        if (isSuspicious) {
            finalRedacted = promptShield.wrapUntrustedData("suspicious_agent_callback", redacted);
        }

        return {
            redacted_message: finalRedacted,
            is_safe: !isSuspicious,
        };
    };
};
