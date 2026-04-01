import { AIMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { OrchestratorStateType } from "../state";
import { SELF_CORRECTION_PROMPT } from "../prompts/self-correction.prompt";

export interface SelfCorrectionDependencies {
    llm: BaseChatModel;
    llmFallback: BaseChatModel;
}

const logger = new Logger("SelfCorrectionNode");

export const createSelfCorrectionNode = (deps: SelfCorrectionDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Self-correcting output for session ${state.session_id}`);
        const { llm, llmFallback } = deps;

        const lastMessage = state.messages[state.messages.length - 1];
        const output = lastMessage.content as string;
        const input =
            (state.messages[state.messages.length - 2]?.content as string) ||
            "";
        const context = state.summary || "";
        const issues =
            state.last_evaluation?.issues?.join(", ") || "Unknown issues";

        let correctedResponse = "";
        try {
            const schema = z.object({
                thought: z.string().describe("Reasoning for the correction"),
                corrected_response: z
                    .string()
                    .describe("The corrected response text"),
            });
            const structuredLlm = llm.withStructuredOutput(schema);
            const structuredFallback = llmFallback.withStructuredOutput(schema);
            const llmWithFallback = structuredLlm.withFallbacks({
                fallbacks: [structuredFallback],
            });

            // Split prompt into system instructions and user data to avoid role confusion
            const systemPrompt =
                SELF_CORRECTION_PROMPT.split("<input>")[0].trim() +
                "\n\n" +
                SELF_CORRECTION_PROMPT.split("</input>")[1].trim();
            const userData =
                `<input>${SELF_CORRECTION_PROMPT.split("<input>")[1].split("</input>")[0]}</input>`
                    .replace("{{context}}", context)
                    .replace("{{input}}", input)
                    .replace("{{output}}", output)
                    .replace("{{issues}}", issues)
                    .trim();

            const response = (await llmWithFallback.invoke(
                [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userData },
                ],
                {
                    runName: "SelfCorrection",
                },
            )) as any;
            logger.log(`Self-Correction Reasoning: ${response.thought}`);
            correctedResponse = response.corrected_response;
        } catch (e) {
            logger.error("All models failed for SelfCorrection:", e);
            // If both fail, keep the original output but maybe redact it or just let it be
            correctedResponse = output;
        }

        const updatedMessages = [...state.messages];
        updatedMessages[updatedMessages.length - 1] = new AIMessage(
            correctedResponse,
        );

        return {
            messages: updatedMessages,
            retry_count: (state.retry_count || 0) + 1,
        };
    };
};
