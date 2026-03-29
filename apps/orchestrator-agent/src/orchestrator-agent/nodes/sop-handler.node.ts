import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StructuredTool } from "@langchain/core/tools";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";
import { OrchestratorStateType } from "../state";
import { formatOrders } from "../utils/format-orders";
import { getSlidingWindowMessages } from "../utils/message-window";
import { SopRequiredData } from "../../modules/clients/knowledge-client/interface/search-sop-response.interface";

/**
 * Helper to build a dynamic Zod schema from SopRequiredData
 */
function buildZodSchema(requiredData: SopRequiredData[]): z.ZodObject<any> {
    const shape: any = {};
    requiredData.forEach((item) => {
        shape[item.name] = getZodType(item).nullable();
    });
    return z.object(shape);
}

function getZodType(item: SopRequiredData): z.ZodTypeAny {
    let schema: z.ZodTypeAny;
    switch (item.type) {
        case "string":
            schema = z.string();
            break;
        case "number":
            schema = z.number();
            break;
        case "boolean":
            schema = z.boolean();
            break;
        case "array":
            if (item.itemsSchema) {
                schema = z.array(buildZodSchema(item.itemsSchema));
            } else {
                schema = z.array(z.string());
            }
            break;
        case "object":
            if (item.properties) {
                schema = buildZodSchema(item.properties);
            } else {
                schema = z.record(z.string());
            }
            break;
        default:
            schema = z.string();
    }
    if (item.description) {
        schema = schema.describe(item.description);
    }
    return schema;
}

/**
 * Helper to identify missing data based on SopRequiredData
 */
function getMissingData(
    requiredData: SopRequiredData[],
    gatheredData: any,
): string[] {
    const missing: string[] = [];
    requiredData.forEach((item) => {
        const value = gatheredData[item.name];
        if (
            value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === "") ||
            (Array.isArray(value) && value.length === 0)
        ) {
            missing.push(item.name);
        } else if (item.type === "object" && item.properties) {
            const nestedMissing = getMissingData(item.properties, value);
            if (nestedMissing.length > 0) {
                missing.push(`${item.name} (${nestedMissing.join(", ")})`);
            }
        }
    });
    return missing;
}

const SOP_AGENT_PROMPT = `
<role>
You are a specialized JSON-only Slot Filling and State-Tracking Agent for OneDelivery. Your output MUST be a valid JSON object and nothing else.
</role>

<goal>
Your goal is to analyze the user's conversation, extract the required data points for the current task, determine the conversation state (\`is_complete\`, \`is_confirmed\`), and request a tool execution when all data is gathered and confirmed.
</goal>

<constraints>
- **Data Gathering Only**: You are a data gatherer, not a decision-maker. Do not validate the feasibility of a request or enforce policies.
- **Strict Schema Adherence**: Your entire output must be a single, valid JSON object that conforms to the provided schema. Do not add any conversational text, notes, or explanations.
- **Normalization**: Correct obvious typos in extracted data (e.g., "topo slow" -> "too slow").
</constraints>

<data_requirements>
Required Data: {{requiredData}}
</data_requirements>

<context>
{{user_context}}
{{summary}}
Current Gathered Data: {{gathered_data}}
Missing Data: {{missing_data}}
Is Awaiting Confirmation: {{is_awaiting_confirmation}}
</context>

<instructions>
1.  **Analyze**: Review the conversation history and context to extract entities required by the SOP.
2.  **State Determination**:
    *   Set \`is_confirmed\` to \`true\` ONLY if the user has explicitly and positively confirmed the summary of gathered details in their latest message.
    *   Set \`is_complete\` to \`true\` ONLY if all required data has been gathered AND the user has confirmed it.
3.  **Tool Request**: If \`is_complete\` is \`true\`, populate \`requested_tool\` with the appropriate tool from the permitted list and its arguments. Otherwise, set it to \`null\`.
</instructions>
`;

const DIALOGUE_PROMPTS = {
    MULTI_INTENT_GUIDANCE:
        "[SYSTEM INSTRUCTION: Acknowledge that the user has multiple requests ({{intents}}). Tell them we will handle them one by one, starting with {{currentIntent}}.]\n\n",
    FALLBACK_RESPONSE:
        "[SYSTEM INSTRUCTION: Politely inform the user that you are not sure how to handle their specific request and ask for clarification.]",
    MISSING_DATA_PROMPT:
        "[SYSTEM INSTRUCTION: Ask the user to provide the following missing information to proceed with {{intent}}: {{missing_fields}}.]",
    CONFIRMATION_PROMPT:
        "[SYSTEM INSTRUCTION: Ask the user to confirm if the following gathered details are correct before proceeding:\n{{gathered_data}}]",
    EXECUTION_PROMPT:
        "[SYSTEM INSTRUCTION: Thank the user for confirming and inform them that the request for {{intent}} has been submitted and is currently being processed.]",
};

export interface SopHandlerDependencies {
    llm: BaseChatModel;
    llmFallback: BaseChatModel;
    tools: StructuredTool[];
    knowledgeClient: KnowledgeClientService;
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
            utilityTools = ["Search_FAQ", "Search_Internal_SOP"],
        } = deps;
        const intent = state.current_intent;
        let sop = state.current_sop;

        // Fetch SOP if not present and intent is specific
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

        // Handle Multi-Intent Guidance
        let multiIntentGuidance = "";
        let updatedMultiIntentAcknowledged = state.multi_intent_acknowledged;
        if (
            state.decomposed_intents.length >= 2 &&
            !state.multi_intent_acknowledged
        ) {
            const otherIntents = state.decomposed_intents
                .filter((i) => i.intent !== intent)
                .map((i) => i.intent);
            const allIntents = [intent, ...otherIntents];
            multiIntentGuidance =
                DIALOGUE_PROMPTS.MULTI_INTENT_GUIDANCE.replace(
                    "{{intents}}",
                    `${allIntents.slice(0, -1).join(", ")} and ${allIntents.slice(-1)}`,
                ).replace("{{currentIntent}}", intent || "");
            updatedMultiIntentAcknowledged = true;
        }

        const userContext =
            state.user_orders.length > 0
                ? `<user_orders>\n${formatOrders(state.user_orders)}\n</user_orders>`
                : "No recent orders found.";
        const summaryContext = state.summary
            ? `<summary>\n${state.summary}\n</summary>`
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
            const toolDescriptions = relevantTools
                .map((t) => `${t.name}: ${t.description}`)
                .join("\n");

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
                extracted_data: dynamicExtractedDataSchema,
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
            const agentPrompt = SOP_AGENT_PROMPT.replace(
                "{{requiredData}}",
                JSON.stringify(sop.requiredData),
            )
                .replace("{{user_context}}", userContext)
                .replace("{{summary}}", summaryContext)
                .replace(
                    "{{gathered_data}}",
                    JSON.stringify(state.order_states),
                )
                .replace("{{missing_data}}", JSON.stringify(missingData))
                .replace(
                    "{{is_awaiting_confirmation}}",
                    state.is_awaiting_confirmation.toString(),
                );

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
                agentOutput = await structuredModelWithFallbacks.invoke([
                    { role: "system", content: agentPrompt },
                    ...contextMessages,
                ]);
                logger.debug(`Agent Output: ${JSON.stringify(agentOutput)}`);
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
            const updatedMissingData = getMissingData(
                sop.requiredData,
                updatedOrderStates,
            );

            if (agentOutput.is_complete && agentOutput.is_confirmed) {
                finalResponse = DIALOGUE_PROMPTS.EXECUTION_PROMPT.replace(
                    "{{intent}}",
                    intent || "this request",
                );
            } else if (
                updatedMissingData.length === 0 &&
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
            } else if (updatedMissingData.length > 0) {
                finalResponse = DIALOGUE_PROMPTS.MISSING_DATA_PROMPT.replace(
                    "{{intent}}",
                    intent || "this request",
                ).replace("{{missing_fields}}", updatedMissingData.join(", "));
            } else {
                finalResponse = DIALOGUE_PROMPTS.FALLBACK_RESPONSE;
            }

            const isConfirmed = agentOutput.is_confirmed === true;
            const isComplete = agentOutput.is_complete === true;

            if (agentOutput.requested_tool && isComplete) {
                const tool = relevantTools.find(
                    (t) => t.name === agentOutput.requested_tool.name,
                );
                if (tool) {
                    try {
                        logger.debug(`Executing tool: ${tool.name}`);
                        let parsedArgs = {};
                        try {
                            parsedArgs = JSON.parse(
                                agentOutput.requested_tool.args,
                            );
                        } catch (e) {
                            logger.error("Failed to parse tool args:", e);
                        }
                        // Inject system fields from state
                        const args: any = {
                            ...parsedArgs,
                            action: state.current_intent.toLowerCase(),
                            userId: state.user_id,
                            sessionId: state.session_id,
                        };
                        // Fire-and-forget: trigger the tool but don't wait for the result.
                        // The backend agent will send a callback when it's done.
                        tool.invoke(args).catch((toolError) => {
                            logger.error(
                                `Asynchronous tool execution error for ${tool.name}:`,
                                toolError,
                            );
                        });
                        logger.log(`Completion tool ${tool.name} triggered.`);
                    } catch (e) {
                        logger.error(
                            `Synchronous tool setup error for ${tool.name}:`,
                            e,
                        );
                        finalResponse = `I encountered an error while trying to start your request. Please try again.`;
                    }
                }
            }

            return {
                partial_responses: [multiIntentGuidance + finalResponse],
                current_intent: isComplete ? null : intent,
                current_sop: isComplete ? null : sop,
                order_states: updatedOrderStates,
                is_awaiting_confirmation:
                    updatedMissingData.length === 0 && !isConfirmed,
                multi_intent_acknowledged: updatedMultiIntentAcknowledged,
            };
        }

        // Default fallback if no SOP is active
        return {
            partial_responses: [DIALOGUE_PROMPTS.FALLBACK_RESPONSE],
            current_intent: null,
            current_sop: null,
        };
    };
};
