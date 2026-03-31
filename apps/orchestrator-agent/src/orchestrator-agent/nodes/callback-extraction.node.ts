import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { AgentCallbackStateType } from "../agent-callback.state";
import { PromptShieldService } from "../../modules/prompt-shield/prompt-shield.service";
import { EXTRACTION_PROMPT } from "../prompts/callback-extraction.prompt";

export interface CallbackExtractionDependencies {
    llm: BaseChatModel;
    promptShield: PromptShieldService;
}

const logger = new Logger("CallbackExtractionNode");

export const createCallbackExtractionNode = (deps: CallbackExtractionDependencies) => {
    return async (state: AgentCallbackStateType) => {
        const { llm, promptShield } = deps;

        if (!state.is_safe) {
            return {
                synthesized_message: "An update was received from our delivery team.",
            };
        }

        const schema = z.object({
            thought: z.string().describe("Reasoning for the synthesis"),
            synthesized_message: z.string().describe("A message for the user"),
        });

        const structuredLlm = llm.withStructuredOutput(schema);

        try {
            const wrappedMessage = promptShield.wrapUntrustedData("agent_message", state.redacted_message);
            const response = await structuredLlm.invoke([
                {
                    role: "system",
                    content: EXTRACTION_PROMPT.replace("{{message}}", wrappedMessage),
                },
            ]);

            logger.log(`Callback Extraction Reasoning: ${response.thought}`);
            return {
                synthesized_message: response.synthesized_message,
            };
        } catch (e) {
            logger.error("Failed to extract data from callback:", e);
            return {
                synthesized_message: "An update was received from our delivery team.",
            };
        }
    };
};
