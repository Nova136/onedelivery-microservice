import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { INPUT_VALIDATOR_PROMPT } from "./prompts/input-validator.prompt";
import { OUTPUT_EVALUATOR_PROMPT } from "./prompts/output-evaluator.prompt";
import {
    inputValidationSchema,
    outputEvaluationSchema,
} from "./types/moderation.types";

@Injectable()
export class ModerationService {
    private readonly logger = new Logger(ModerationService.name);
    private readonly criticLlm: ChatOpenAI;

    constructor(private configService: ConfigService) {
        this.criticLlm = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            temperature: 0,
            apiKey: this.configService.get("OPENAI_API_KEY"),
        });
    }

    /**
     * GUARD 1: Validate the user's input before the agent sees it.
     */
    async validateInput(
        message: string,
    ): Promise<{ safe: boolean; reason?: string }> {
        const chain = ChatPromptTemplate.fromMessages([
            ["system", INPUT_VALIDATOR_PROMPT],
            ["human", "{input}"],
        ]).pipe(this.criticLlm.withStructuredOutput(inputValidationSchema));

        try {
            const result = await chain.invoke({ input: message });
            return result as { safe: boolean; reason?: string };
        } catch (error) {
            this.logger.error("Input validation failed", error);
            return { safe: true }; // Fail-open
        }
    }

    /**
     * GUARD 2: Evaluate the agent's draft before sending it to the customer.
     */
    async evaluateOutput(
        conversationContext: string,
        draftResponse: string,
    ): Promise<{ approved: boolean; feedback?: string }> {
        const chain = ChatPromptTemplate.fromMessages([
            ["system", OUTPUT_EVALUATOR_PROMPT],
            [
                "human",
                "Recent Conversation:\n{conversationContext}\n\nAI Draft Response: {draftResponse}",
            ],
        ]).pipe(this.criticLlm.withStructuredOutput(outputEvaluationSchema));

        try {
            const result = await chain.invoke({
                conversationContext,
                draftResponse,
            });
            return result as { approved: boolean; feedback?: string };
        } catch (error) {
            this.logger.error("Output evaluation failed", error);
            return { approved: true }; // Fail-open
        }
    }
}
