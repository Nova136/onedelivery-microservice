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
You are a helpful and empathetic customer support agent for OneDelivery.
</role>

<task>
Follow the Standard Operating Procedure (SOP) for "{{intentCode}}": "{{title}}".
</task>

<sop>
Required Data: {{requiredData}}
Workflow Steps:
{{workflowSteps}}
</sop>

<context>
{{user_context}}
{{summary}}
Current Gathered Data: {{gathered_data}}
Missing Data: {{missing_data}}
Is Awaiting Confirmation: {{is_awaiting_confirmation}}
</context>

<instructions>
1. **Analyze**: Review the conversation history and context to extract any required entities.
2. **Update State**: 
   - Identify what has been gathered. 
   - Set "is_confirmed" to true ONLY if the user explicitly confirms a summary of the details you've already gathered.
   - If they are providing new information or changing details, "is_confirmed" should be false.
3. **Dialogue**: 
   - If data is missing, ask for it naturally and empathetically. You can ask for multiple missing items at once if it makes sense for a better user experience.
   - If all data is gathered but not confirmed, present a clear summary of the details and ask for confirmation.
   - If confirmed, inform the user you are proceeding with their request.
4. **Tools**: You have access to the following tools: {{tool_descriptions}}. 
   - If the SOP requires executing a tool and you have all the data and confirmation, specify the tool call in your output.
   - Use helper tools (like Search_FAQ) if they help you answer the user's questions.
5. **Output**: You MUST return a JSON object following the required schema.
</instructions>
`;

const DIALOGUE_PROMPTS = {
    MULTI_INTENT_GUIDANCE:
        "I've noted your requests about {{intents}}. To ensure we handle everything correctly, let's address them one by one, starting with {{currentIntent}}.\n\n",
    FALLBACK_RESPONSE:
        "I'm sorry, I'm not quite sure how to handle that specific request. Could you please provide a bit more detail or clarify what you need?",
};

export interface SopHandlerDependencies {
    strongModel: BaseChatModel;
    tools: StructuredTool[];
    knowledgeClient: KnowledgeClientService;
    utilityTools?: string[];
}

const logger = new Logger("SopHandlerNode");

export const createSopHandlerNode = (deps: SopHandlerDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Processing state for session ${state.session_id}`);
        const {
            strongModel,
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
                response: z
                    .string()
                    .describe("Your natural language response to the user."),
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
                "{{intentCode}}",
                intent || "GENERAL",
            )
                .replace("{{title}}", sop.title)
                .replace("{{requiredData}}", JSON.stringify(sop.requiredData))
                .replace(
                    "{{workflowSteps}}",
                    sop.workflowSteps
                        .map((s: string, i: number) => `${i + 1}. ${s}`)
                        .join("\n"),
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
                )
                .replace("{{tool_descriptions}}", toolDescriptions);

            let agentOutput: any;
            try {
                if (
                    typeof (strongModel as any).withStructuredOutput ===
                    "function"
                ) {
                    const structuredModel = (
                        strongModel as any
                    ).withStructuredOutput(dynamicSopResponseSchema);
                    agentOutput = await structuredModel.invoke([
                        { role: "system", content: agentPrompt },
                        ...contextMessages,
                    ]);
                } else {
                    // Fallback for models/runnables without withStructuredOutput
                    logger.warn(
                        "strongModel does not support withStructuredOutput directly. Using prompt-based JSON extraction.",
                    );
                    const jsonPrompt = `${agentPrompt}\n\nYou MUST respond with a valid JSON object matching this schema: ${JSON.stringify((dynamicSopResponseSchema as any).shape)}`;
                    const res = await strongModel.invoke([
                        { role: "system", content: jsonPrompt },
                        ...contextMessages,
                    ]);
                    const content =
                        typeof res.content === "string"
                            ? res.content
                            : JSON.stringify(res.content);
                    agentOutput = JSON.parse(
                        content.replace(/```json|```/g, ""),
                    );
                }
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
            let finalResponse = agentOutput.response;
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
                        const args = {
                            ...parsedArgs,
                            userId: state.user_id,
                            sessionId: state.session_id,
                        };
                        const toolResult = await tool.invoke(args);

                        if (sop.permittedTools?.includes(tool.name)) {
                            logger.log(
                                `Completion tool ${tool.name} executed successfully for SOP ${sop.id}.`,
                            );
                        }
                    } catch (e) {
                        logger.error(
                            `Tool execution error for ${tool.name}:`,
                            e,
                        );
                        finalResponse = `I encountered an error while processing your request. Please try again in a moment.`;
                    }
                }
            }

            const updatedMissingData = getMissingData(
                sop.requiredData,
                updatedOrderStates,
            );

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
