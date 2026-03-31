import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StructuredTool } from "@langchain/core/tools";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";
import { OrchestratorStateType } from "../state";
import { formatOrders } from "../utils/format-orders";
import { getSlidingWindowMessages } from "../utils/message-window";
import { PromptShieldService } from "../../modules/prompt-shield/prompt-shield.service";
import { buildZodSchema, getMissingData } from "../utils/sop-utils";
import { SOP_AGENT_PROMPT, DIALOGUE_PROMPTS } from "../prompts/sop.prompt";
import { executeSopTool } from "../utils/sop-tool-executor";

export interface SopHandlerDependencies {
    llm: BaseChatModel;
    llmFallback: BaseChatModel;
    tools: StructuredTool[];
    knowledgeClient: KnowledgeClientService;
    promptShield: PromptShieldService;
    utilityTools?: string[];
}

const logger = new Logger("SopHandlerNode");

export const createSopHandlerNode = (deps: SopHandlerDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Processing state for session ${state.session_id}`);
        const {
            llm,
            llmFallback,
            tools,
            knowledgeClient,
            promptShield,
            utilityTools = ["Search_FAQ", "Search_Internal_SOP"],
        } = deps;
        const intent = state.current_intent;
        let sop = state.current_sop;

        // Fetch SOP if not present or if intent has changed
        if (sop && intent && sop.intentCode !== intent) {
            logger.debug(
                `Intent mismatch: current_intent=${intent}, sop.intentCode=${sop.intentCode}. Clearing SOP.`,
            );
            sop = null;
        }

        if (
            !sop &&
            intent &&
            !["faq", "general", "escalate", "end_session", "reset"].includes(
                intent,
            )
        ) {
            try {
                sop = await knowledgeClient.searchInternalSop({
                    intentCode: intent,
                    requestingAgent: "orchestrator",
                });
                logger.debug(
                    `SOP fetched for intent ${intent}: ${sop ? "found" : "not found"}`,
                );
            } catch (e) {
                logger.error("Failed to fetch SOP:", e);
            }
        }

        // Use sliding window for context
        const contextMessages = getSlidingWindowMessages(state.messages, 5);

        // Isolate the specific query for this intent if available from the router
        const currentIntentObj =
            state.decomposed_intents[state.current_intent_index];
        const query =
            currentIntentObj?.query ||
            (state.messages[state.messages.length - 1].content as string);

        // Replace the last message in the context window with the isolated query
        // This prevents the SOP agent from getting confused by multi-intent messages
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

        const userContext =
            state.user_orders.length > 0
                ? promptShield.wrapUntrustedData(
                      "user_orders",
                      formatOrders(state.user_orders),
                  )
                : "No recent orders found.";
        const summaryContext = state.summary
            ? promptShield.wrapUntrustedData("session_summary", state.summary)
            : "No previous conversation summary.";

        if (sop) {
            // 1. Prepare State and Tools
            const missingData = getMissingData(
                sop.requiredData,
                state.order_states,
            );

            // Separate tools into utility tools (always available) and handoff tools (SOP-specific)
            const helperTools = tools.filter((t) =>
                utilityTools.includes(t.name),
            );
            const handoffTools = tools.filter((t) =>
                sop.permittedTools?.includes(t.name),
            );

            const relevantTools = [...helperTools, ...handoffTools];

            // 2. Derive Dynamic Schema based on SOP
            const dynamicExtractedDataSchema = buildZodSchema(
                sop.requiredData,
            ).describe(
                "Entities extracted from the conversation as required by the SOP.",
            );

            // Build the tool enum if permitted tools exist
            const permittedToolNames = relevantTools.map((t) => t.name);
            const toolNameSchema =
                permittedToolNames.length > 0
                    ? z.enum(permittedToolNames as [string, ...string[]])
                    : z.string();

            const dynamicSopResponseSchema = z.object({
                thought: z
                    .string()
                    .describe(
                        "Step-by-step reasoning for the current state and actions.",
                    ),
                extracted_data: dynamicExtractedDataSchema,
                missing_fields: z
                    .array(z.string())
                    .describe(
                        "A list of fields that are still missing based on the SOP logic. You MUST include ALL fields from the 'Missing Data' section in the context unless they are explicitly conditional and the condition is not met. Do NOT filter this list based on what you think should be asked first; provide the full list of missing required data.",
                    ),
                is_confirmed: z
                    .boolean()
                    .describe(
                        "Whether the user has explicitly confirmed the details gathered so far.",
                    ),
                is_complete: z
                    .boolean()
                    .describe(
                        "Whether all required information (including conditional ones) has been gathered and confirmed, and the request is ready for execution.",
                    ),
                requested_tool: z
                    .object({
                        name: toolNameSchema.describe(
                            "The name of the tool to execute.",
                        ),
                        args: z
                            .string()
                            .describe(
                                "A JSON string containing the arguments for the tool call. Must be a valid JSON object.",
                            ),
                    })
                    .nullable()
                    .describe(
                        "A tool call to execute ONLY if all SOP requirements and confirmation are met.",
                    ),
            });

            // 3. Unified Agent Call
            let agentOutput: any;
            try {
                const structuredModel = llm.withStructuredOutput(
                    dynamicSopResponseSchema,
                );
                const structuredModelFallback =
                    llmFallback.withStructuredOutput(dynamicSopResponseSchema);
                const structuredModelWithFallbacks =
                    structuredModel.withFallbacks({
                        fallbacks: [structuredModelFallback],
                    });
                // Split prompt into system instructions and user data to avoid role confusion
                const systemPrompt =
                    SOP_AGENT_PROMPT.split("<input>")[0].trim() +
                    "\n\n" +
                    SOP_AGENT_PROMPT.split("</input>")[1].trim();
                const userData =
                    `<input>${SOP_AGENT_PROMPT.split("<input>")[1].split("</input>")[0]}</input>`
                        .replace(
                            "{{requiredData}}",
                            JSON.stringify(sop.requiredData),
                        )
                        .replace("{{current_intent}}", intent || "Unknown")
                        .replace("{{current_intent}}", intent || "Unknown")
                        .replace("{{user_context}}", userContext)
                        .replace("{{summary}}", summaryContext)
                        .replace(
                            "{{gathered_data}}",
                            JSON.stringify(state.order_states),
                        )
                        .replace(
                            "{{missing_data}}",
                            JSON.stringify(missingData),
                        )
                        .replace(
                            "{{is_awaiting_confirmation}}",
                            state.is_awaiting_confirmation.toString(),
                        )
                        .trim();

                agentOutput = await structuredModelWithFallbacks.invoke(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userData },
                        ...contextMessages,
                    ],
                    {
                        runName: "SopHandler",
                    },
                );
                logger.log(`SOP Agent Reasoning: ${agentOutput.thought}`);
                logger.debug(
                    `SOP Agent State: ${JSON.stringify({
                        extracted_data: agentOutput.extracted_data,
                        missing_fields: agentOutput.missing_fields,
                        is_complete: agentOutput.is_complete,
                        requested_tool: agentOutput.requested_tool?.name,
                    })}`,
                );
            } catch (e) {
                logger.error(
                    "Failed to get structured output from SOP Agent:",
                    e,
                );
                return {
                    partial_responses: [DIALOGUE_PROMPTS.FALLBACK_RESPONSE],
                    current_intent: intent,
                    current_sop: sop,
                };
            }

            // 3. Process Output and Handle Tools
            let updatedOrderStates = {
                ...state.order_states,
                ...agentOutput.extracted_data,
            };
            let finalResponse = "";

            // Use LLM-identified missing fields for conditional logic support
            const missingFields = agentOutput.missing_fields || [];

            if (agentOutput.is_complete && agentOutput.is_confirmed) {
                finalResponse = DIALOGUE_PROMPTS.EXECUTION_PROMPT.replace(
                    "{{intent}}",
                    intent || "this request",
                );
            } else if (
                missingFields.length === 0 &&
                !agentOutput.is_confirmed
            ) {
                const gatheredDataSummary = Object.entries(updatedOrderStates)
                    .filter(
                        ([, value]) =>
                            value !== null &&
                            value !== undefined &&
                            (!Array.isArray(value) || value.length > 0),
                    )
                    .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
                    .join("\n");
                finalResponse = DIALOGUE_PROMPTS.CONFIRMATION_PROMPT.replace(
                    "{{gathered_data}}",
                    gatheredDataSummary,
                );
            } else if (missingFields.length > 0) {
                finalResponse = DIALOGUE_PROMPTS.MISSING_DATA_PROMPT.replace(
                    "{{intent}}",
                    intent || "this request",
                ).replace("{{missing_fields}}", missingFields.join(", "));
            } else {
                finalResponse = DIALOGUE_PROMPTS.FALLBACK_RESPONSE;
            }

            const isConfirmed = agentOutput.is_confirmed === true;
            const isComplete = agentOutput.is_complete === true;

            let messages: any[] = [];

            if (agentOutput.requested_tool && isComplete) {
                const tool = relevantTools.find(
                    (t) => t.name === agentOutput.requested_tool.name,
                );
                if (tool) {
                    const executionResult = await executeSopTool(
                        tool,
                        agentOutput,
                        state,
                        intent || "",
                        updatedOrderStates,
                    );

                    if (executionResult.partial_responses) {
                        return {
                            partial_responses:
                                executionResult.partial_responses,
                            current_intent: intent,
                            current_sop: sop,
                            order_states:
                                executionResult.updatedOrderStates ||
                                updatedOrderStates,
                            is_awaiting_confirmation:
                                executionResult.is_awaiting_confirmation ??
                                false,
                            retrieved_context: sop ? [JSON.stringify(sop)] : [],
                        };
                    }

                    messages = executionResult.messages;
                    if (executionResult.finalResponse) {
                        finalResponse = executionResult.finalResponse;
                    }
                }
            }

            return {
                messages,
                partial_responses: [finalResponse],
                current_intent: isComplete ? null : intent,
                current_sop: isComplete ? null : sop,
                order_states: isComplete ? null : updatedOrderStates,
                is_awaiting_confirmation:
                    missingFields.length === 0 && !isConfirmed,
                retrieved_context: sop ? [JSON.stringify(sop)] : [],
            };
        }

        // Default fallback if no SOP is active
        return {
            partial_responses: [DIALOGUE_PROMPTS.FALLBACK_RESPONSE],
            current_intent: null,
            current_sop: null,
            retrieved_context: [],
        };
    };
};
