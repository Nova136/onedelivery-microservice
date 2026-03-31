import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { AgentCallbackStateType } from "../agent-callback.state";
import { PromptShieldService } from "../../modules/prompt-shield/prompt-shield.service";
import { EXTRACTION_PROMPT } from "../prompts/callback-extraction.prompt";

export interface CallbackExtractionDependencies {
    llm: BaseChatModel;
    llmFallback: BaseChatModel;
    promptShield: PromptShieldService;
}

const logger = new Logger("CallbackExtractionNode");

export const createCallbackExtractionNode = (
    deps: CallbackExtractionDependencies,
) => {
    return async (state: AgentCallbackStateType) => {
        const { llm, llmFallback, promptShield } = deps;

        if (!state.is_safe) {
            return {
                synthesized_message:
                    "An update was received from our delivery team.",
            };
        }

        const schema = z.object({
            thought: z.string().describe("Reasoning for the synthesis"),
            synthesized_message: z.string().describe("A message for the user"),
        });

        const structuredLlm = llm.withStructuredOutput(schema);
        const structuredFallback = llmFallback.withStructuredOutput(schema);
        const llmWithFallback = structuredLlm.withFallbacks({
            fallbacks: [structuredFallback],
        });

        try {
            const wrappedMessage = promptShield.wrapUntrustedData(
                "agent_message",
                state.redacted_message,
            );

            // Split prompt into system instructions and user data to avoid role confusion
            const systemPrompt =
                EXTRACTION_PROMPT.split("<agent_message>")[0].trim();
            const userData =
                `<agent_message>${EXTRACTION_PROMPT.split("<agent_message>")[1]}`
                    .replace("{{message}}", wrappedMessage)
                    .trim();

            const response = await llmWithFallback.invoke(
                [
                    {
                        role: "system",
                        content: systemPrompt,
                    },
                    {
                        role: "user",
                        content: userData,
                    },
                ],
                {
                    runName: "CallbackExtraction",
                },
            );

            logger.log(`Callback Extraction Reasoning: ${response.thought}`);
            return {
                synthesized_message: response.synthesized_message,
            };
        } catch (e) {
            logger.error("Failed to extract data from callback:", e);
            return {
                synthesized_message:
                    "An update was received from our delivery team.",
            };
        }
    };
};
