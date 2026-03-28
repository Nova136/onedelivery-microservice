import { AIMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredTool } from "@langchain/core/tools";
import { ENTITY_EXTRACTOR_PROMPT } from "../prompts/entity-extractor.prompt";
import { DIALOGUE_PROMPTS } from "../prompts/dialogue.prompt";
import { getSlidingWindowMessages } from "../utils/message-window";

import { formatOrders } from "../utils/format-orders";

export interface DialogueDependencies {
    strongModel: ChatOpenAI;
    tools: StructuredTool[];
}

export const createDialogueNode = (deps: DialogueDependencies) => {
    return async (state: OrchestratorStateType) => {
        const { strongModel, tools } = deps;
        const category = state.current_category;
        const intent = state.current_intent;
        const sop = state.current_sop;

        // Use sliding window for context
        const contextMessages = getSlidingWindowMessages(state.messages, 5);
        const lastMessage = state.messages[state.messages.length - 1];
        const content = lastMessage.content as string;

        // Handle Multi-Intent Guidance
        let multiIntentGuidance = "";
        let updatedMultiIntentAcknowledged = state.multi_intent_acknowledged;
        if (
            state.intent_queue.length >= 2 &&
            !state.multi_intent_acknowledged
        ) {
            const allCategories = [category, ...state.intent_queue];
            multiIntentGuidance =
                DIALOGUE_PROMPTS.MULTI_INTENT_GUIDANCE.replace(
                    "{{categories}}",
                    `${allCategories.slice(0, -1).join(", ")} and ${allCategories.slice(-1)}`,
                ).replace("{{currentCategory}}", category || "");
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
            let updatedOrderStates = { ...state.order_states };

            // 1. Identify Required Information (Slot Filling) AND Confirmation
            const extractionPrompt = ENTITY_EXTRACTOR_PROMPT.replace(
                "{{intentCode}}",
                intent || "GENERAL",
            )
                .replace("{{requiredData}}", JSON.stringify(sop.requiredData))
                .replace("{{user_context}}", userContext)
                .replace("{{summary}}", summaryContext)
                .replace(
                    "{{current_order_states}}",
                    `<current_states>\n${JSON.stringify(state.order_states, null, 2)}\n</current_states>`,
                );

            const extractionResponse = await strongModel.invoke([
                { role: "system", content: extractionPrompt },
                ...contextMessages,
            ]);

            let extractedData: any = {};
            try {
                const jsonStr =
                    extractionResponse.content
                        .toString()
                        .match(/\{.*\}/s)?.[0] || "{}";
                extractedData = JSON.parse(jsonStr);
            } catch (e) {
                console.error("Extraction Parse Error:", e);
            }

            // PERSISTENCE: Merge with existing states
            updatedOrderStates = { ...state.order_states, ...extractedData };
            const isConfirmed =
                state.is_awaiting_confirmation &&
                extractedData.is_confirmed === true;
            const isRejected =
                state.is_awaiting_confirmation &&
                extractedData.is_confirmed === false;

            if (
                isRejected &&
                Object.keys(extractedData).filter(
                    (k) => k !== "is_confirmed" && sop.requiredData.includes(k),
                ).length === 0
            ) {
                return {
                    messages: [
                        new AIMessage(DIALOGUE_PROMPTS.REJECTION_RESPONSE),
                    ],
                    is_awaiting_confirmation: false,
                    layers: [
                        {
                            name: "Dialogue",
                            status: "completed",
                            data: "Confirmation rejected",
                        },
                    ],
                };
            }

            // 2. Follow SOP: Check for missing data
            const missingData = sop.requiredData.filter(
                (key: string) => !updatedOrderStates[key],
            );

            if (missingData.length > 0) {
                const prompt = DIALOGUE_PROMPTS.MISSING_DATA.replace(
                    "{{intent}}",
                    intent?.replace("_", " ").toLowerCase() || "",
                ).replace("{{missingField}}", missingData[0]);
                return {
                    messages: [new AIMessage(multiIntentGuidance + prompt)],
                    order_states: updatedOrderStates,
                    multi_intent_acknowledged: updatedMultiIntentAcknowledged,
                    is_awaiting_confirmation: false,
                    layers: [
                        {
                            name: "Dialogue",
                            status: "completed",
                            data: `SOP: ${intent} | Missing: ${missingData.join(", ")}`,
                        },
                    ],
                };
            }

            // 3. Confirmation Step: If all data gathered but not yet confirmed
            if (!isConfirmed) {
                const summaryList = Object.entries(updatedOrderStates)
                    .filter(([key]) => sop.requiredData.includes(key))
                    .map(([key, value]) => `- ${key}: ${value}`)
                    .join("\n");

                const confirmationPrompt =
                    DIALOGUE_PROMPTS.CONFIRMATION.replace(
                        "{{intent}}",
                        intent?.replace("_", " ").toLowerCase() || "",
                    ).replace("{{summaryList}}", summaryList);

                return {
                    messages: [
                        new AIMessage(multiIntentGuidance + confirmationPrompt),
                    ],
                    order_states: updatedOrderStates,
                    is_awaiting_confirmation: true,
                    multi_intent_acknowledged: updatedMultiIntentAcknowledged,
                    layers: [
                        {
                            name: "Dialogue",
                            status: "completed",
                            data: "Awaiting user confirmation",
                        },
                    ],
                };
            }

            // 4. Handoff to other agents (After confirmation)
            const identifier = updatedOrderStates.orderId || state.session_id;
            const idLabel = updatedOrderStates.orderId
                ? "Order ID"
                : "Request ID";
            let agentReply = DIALOGUE_PROMPTS.HANDOFF_SUBMITTING.replace(
                "{{intent}}",
                intent?.replace("_", " ").toLowerCase() || "",
            )
                .replace("{{idLabel}}", idLabel)
                .replace("{{identifier}}", identifier);

            // Perform actual handoff if tool exists
            try {
                if (sop.agentOwner === "logistic") {
                    const tool = tools.find(
                        (t) => t.name === "Route_To_Logistics",
                    );
                    if (tool) {
                        const toolResult = await tool.invoke({
                            action: "cancel_order",
                            userId: state.user_id,
                            sessionId: state.session_id,
                            orderId: updatedOrderStates.orderId,
                            description:
                                updatedOrderStates.reason ||
                                updatedOrderStates.issueDescription ||
                                content,
                        });
                        if (toolResult && !toolResult.includes("Error")) {
                            agentReply =
                                DIALOGUE_PROMPTS.HANDOFF_SUCCESS.replace(
                                    "{{intent}}",
                                    intent?.replace("_", " ").toLowerCase() ||
                                        "",
                                )
                                    .replace("{{idLabel}}", idLabel)
                                    .replace("{{identifier}}", identifier)
                                    .replace("{{toolResult}}", toolResult);
                        } else if (toolResult.includes("Error")) {
                            agentReply = toolResult;
                        }
                    }
                } else if (sop.agentOwner === "resolution") {
                    const tool = tools.find(
                        (t) => t.name === "Route_To_Resolution",
                    );
                    if (tool) {
                        const toolResult = await tool.invoke({
                            action: "request_refund",
                            userId: state.user_id,
                            sessionId: state.session_id,
                            orderId: updatedOrderStates.orderId,
                            issueCategory: intent
                                ?.toLowerCase()
                                .includes("missing")
                                ? "missing_item"
                                : "quality_issue",
                            description:
                                updatedOrderStates.reason ||
                                updatedOrderStates.issueDescription ||
                                content,
                            items: updatedOrderStates.missingItems
                                ? [
                                      {
                                          name: updatedOrderStates.missingItems,
                                          quantity: 1,
                                      },
                                  ]
                                : [],
                        });
                        if (toolResult && !toolResult.includes("Error")) {
                            agentReply =
                                DIALOGUE_PROMPTS.HANDOFF_SUCCESS.replace(
                                    "{{intent}}",
                                    intent?.replace("_", " ").toLowerCase() ||
                                        "",
                                )
                                    .replace("{{idLabel}}", idLabel)
                                    .replace("{{identifier}}", identifier)
                                    .replace("{{toolResult}}", toolResult);
                        } else if (toolResult.includes("Error")) {
                            agentReply = toolResult;
                        }
                    }
                }
            } catch (e) {
                console.error("Handoff Error:", e);
                agentReply = DIALOGUE_PROMPTS.HANDOFF_ERROR.replace(
                    "{{idLabel}}",
                    idLabel,
                ).replace("{{identifier}}", identifier);
            }

            // Check if there's another intent in the queue
            const nextCategory =
                state.intent_queue.length > 0 ? state.intent_queue[0] : null;
            const nextQueue = state.intent_queue.slice(1);

            let finalReply = agentReply;
            if (nextCategory) {
                finalReply += DIALOGUE_PROMPTS.NEXT_INTENT_TRANSITION.replace(
                    "{{nextCategory}}",
                    nextCategory,
                );
            }

            return {
                messages: [new AIMessage(multiIntentGuidance + finalReply)],
                current_category: nextCategory,
                current_intent: null,
                current_sop: null,
                intent_queue: nextQueue,
                order_states: updatedOrderStates, // Keep the states for the next intent
                is_awaiting_confirmation: false,
                multi_intent_acknowledged: updatedMultiIntentAcknowledged,
                layers: [
                    {
                        name: "Dialogue",
                        status: "completed",
                        data: `Handoff to ${sop.agentOwner}`,
                    },
                ],
            };
        }

        // Default fallback if no SOP is active (should be handled by general_handler, but safety first)
        return {
            messages: [new AIMessage(DIALOGUE_PROMPTS.FALLBACK_RESPONSE)],
            current_category: null,
            current_intent: null,
            current_sop: null,
            layers: [
                {
                    name: "Dialogue",
                    status: "failed",
                    data: "No active SOP in dialogue node",
                },
            ],
        };
    };
};
