import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StructuredTool } from "@langchain/core/tools";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { OrchestratorStateType } from "../state";
import { formatOrders } from "../utils/format-orders";
import { getSlidingWindowMessages } from "../utils/message-window";
import { PromptShieldService } from "../../modules/prompt-shield/prompt-shield.service";
import {
    FAQ_SUMMARIZER_PROMPT,
    GENERAL_HANDLER_PROMPT,
} from "../prompts/informational.prompt";

export interface InformationalHandlerDependencies {
    llm: BaseChatModel;
    llmFallback: BaseChatModel;
    tools: StructuredTool[];
    promptShield: PromptShieldService;
}

const logger = new Logger("InformationalHandlerNode");

export const createInformationalHandlerNode = (
    deps: InformationalHandlerDependencies,
) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Processing state for session ${state.session_id}`);
        const { llm, llmFallback, tools, promptShield } = deps;

        const contextMessages = getSlidingWindowMessages(state.messages, 3);
        const lastMessage = state.messages[state.messages.length - 1];

        const currentIntent =
            state.decomposed_intents[state.current_intent_index];
        const intentCode = currentIntent?.intent || "general";
        const query = currentIntent?.query || (lastMessage.content as string);

        // Replace the last message in the context window with the isolated query
        // This prevents the informational agent from getting confused by multi-intent messages
        if (contextMessages.length > 0) {
            const lastMsg = contextMessages[contextMessages.length - 1];
            if (lastMsg.constructor.name === "HumanMessage") {
                // We recreate it to ensure it's a fresh instance with just the isolated query
                contextMessages[contextMessages.length - 1] = {
                    ...lastMsg,
                    content: query,
                } as any;
            }
        }

        if (intentCode === "faq") {
            const faqTool = tools.find((t) => t.name === "Search_FAQ");
            if (!faqTool) {
                return {
                    messages: [
                        new AIMessage(
                            "I'm sorry, I'm having trouble accessing our FAQ system right now. How else can I help you?",
                        ),
                    ],
                };
            }

            let toolResult: any;
            const systemMessages: SystemMessage[] = [];
            try {
                toolResult = await faqTool.invoke({ query });
                systemMessages.push(
                    new SystemMessage(
                        `SYSTEM_ACTION: Tool Search_FAQ executed successfully.`,
                    ),
                );
            } catch (e) {
                logger.error("FAQ Tool execution error:", e);
                toolResult =
                    "System Error: Knowledge Microservice unreachable. STRICT RULE: Tell the user you are experiencing technical difficulties and ask them to visit the FAQ page or try again later.";
                systemMessages.push(
                    new SystemMessage(`SYSTEM_ACTION: Tool Search_FAQ failed.`),
                );
            }

            let finalResponseContent: string;
            try {
                const schema = z.object({
                    thought: z.string().describe("Reasoning for the response"),
                    response: z
                        .string()
                        .describe("The final response to the user"),
                });
                const structuredLlm = llm.withStructuredOutput(schema);
                const structuredFallback =
                    llmFallback.withStructuredOutput(schema);
                const llmWithFallback = structuredLlm.withFallbacks({
                    fallbacks: [structuredFallback],
                });

                const systemPrompt =
                    FAQ_SUMMARIZER_PROMPT.split("<input>")[0].trim() +
                    "\n\n" +
                    FAQ_SUMMARIZER_PROMPT.split("</input>")[1].trim();
                const userData =
                    `<input>${FAQ_SUMMARIZER_PROMPT.split("<input>")[1].split("</input>")[0]}</input>`
                        .replace("{{query}}", query)
                        .replace("{{results}}", JSON.stringify(toolResult))
                        .trim();

                const finalResponse = (await llmWithFallback.invoke(
                    [
                        { role: "system", content: systemPrompt },
                        ...contextMessages,
                        {
                            role: "user",
                            content: userData,
                        },
                    ],
                    {
                        runName: "FaqHandler",
                    },
                )) as any;
                logger.log(`FAQ Handler Reasoning: ${finalResponse.thought}`);
                finalResponseContent = finalResponse.response;
            } catch (e) {
                logger.error("All models failed for FAQ:", e);
                finalResponseContent =
                    "I'm sorry, I'm having trouble processing your request right now.";
            }

            return {
                messages: systemMessages,
                partial_responses: [finalResponseContent],
                retrieved_context: [JSON.stringify(toolResult)],
            };
        } else {
            // General Handler logic
            const userContext =
                state.user_orders.length > 0
                    ? promptShield.wrapUntrustedData(
                          "user_orders",
                          formatOrders(state.user_orders),
                      )
                    : "No recent orders found.";
            const summaryContext = state.summary
                ? promptShield.wrapUntrustedData(
                      "session_summary",
                      state.summary,
                  )
                : "No previous conversation summary.";

            const sessionContext = `<session_context>\nUser ID: ${state.user_id}\nSession ID: ${state.session_id}\n</session_context>`;

            let responseContent: string;
            try {
                const schema = z.object({
                    thought: z.string().describe("Reasoning for the response"),
                    response: z
                        .string()
                        .describe("The final response to the user"),
                });
                const structuredLlm = llm.withStructuredOutput(schema);
                const structuredFallback =
                    llmFallback.withStructuredOutput(schema);
                const llmWithFallback = structuredLlm.withFallbacks({
                    fallbacks: [structuredFallback],
                });

                // Split prompt into system instructions and user data to avoid role confusion
                const systemPrompt =
                    GENERAL_HANDLER_PROMPT.split("<context>")[0].trim() +
                    "\n\n" +
                    GENERAL_HANDLER_PROMPT.split("</context>")[1].trim();
                const userData =
                    `<context>${GENERAL_HANDLER_PROMPT.split("<context>")[1].split("</context>")[0]}</context>`
                        .replace("{{userContext}}", userContext)
                        .replace("{{summaryContext}}", summaryContext)
                        .replace("{{sessionContext}}", sessionContext)
                        .trim();

                const response = (await llmWithFallback.invoke(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userData },
                        ...contextMessages,
                    ],
                    {
                        runName: "GeneralHandler",
                    },
                )) as any;
                logger.log(`General Handler Reasoning: ${response.thought}`);
                responseContent = response.response;
            } catch (e) {
                logger.error("All models failed for General Handler:", e);
                responseContent =
                    "I'm sorry, I'm having trouble processing your request right now.";
            }

            return {
                partial_responses: [responseContent],
            };
        }
    };
};
