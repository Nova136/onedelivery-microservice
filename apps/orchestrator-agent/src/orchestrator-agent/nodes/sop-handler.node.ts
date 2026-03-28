import { OrchestratorStateType } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredTool } from "@langchain/core/tools";
import { getSlidingWindowMessages } from "../utils/message-window";
import { Logger } from "@nestjs/common";
import { KnowledgeClientService } from "../../modules/clients/knowledge-client/knowledge-client.service";
import { formatOrders } from "../utils/format-orders";

const ENTITY_EXTRACTOR_PROMPT = `
<role>
You are a high-precision Entity Extractor for OneDelivery.
</role>

<task>
Extract entities for the SOP "{{intentCode}}".
Required entities: {{requiredData}}.
</task>

<context>
{{user_context}}
{{summary}}
{{current_order_states}}
</context>

<instructions>
1. **Extract**:
   - Carefully identify and extract each required entity from the conversation and context.
   - If an entity is missing, set its value to null.
2. **Confirmation Status**:
   - Set "is_confirmed" to true if the user explicitly confirms (e.g., "yes", "correct", "proceed").
   - Set "is_confirmed" to false if the user rejects, changes details, or hasn't confirmed yet.
3. **Output**:
   - Return ONLY a valid JSON object containing the extracted entities and "is_confirmed".
   - Do not include any other text, explanations, or markdown formatting.
</instructions>

<example>
User: "I want to cancel my order ORD-12345 because it's delayed."
Required: ["orderId", "reason"]
Output: { "orderId": "ORD-12345", "reason": "delayed", "is_confirmed": false }
</example>
`;

const DIALOGUE_PROMPTS = {
  MULTI_INTENT_GUIDANCE: "I've noted your requests about {{categories}}. To ensure we handle everything correctly, let's address them one by one, starting with {{currentCategory}}.\n\n",
  MISSING_DATA: "To help you with your {{intent}}, I just need a bit more information. Could you please provide your {{missingField}}?",
  CONFIRMATION: "I've gathered the following details for your {{intent}}:\n\n{{summaryList}}\n\nDoes everything look correct? Shall I go ahead and submit this for you?",
  HANDOFF_SUBMITTING: "Thank you. I've gathered all the necessary details for your {{intent}}. I'm now submitting this request ({{idLabel}}: {{identifier}}) to our specialized team.",
  HANDOFF_SUCCESS: "Great news! I've successfully submitted your {{intent}} request ({{idLabel}}: {{identifier}}). {{toolResult}}",
  HANDOFF_ERROR: "I'm sorry, I encountered a slight issue while submitting your request ({{idLabel}}: {{identifier}}). Could you please try again in a moment?",
  NEXT_INTENT_TRANSITION: "\n\nNow, let's move on to your request regarding {{nextCategory}}.",
  REJECTION_RESPONSE: "No problem at all. What would you like to change or clarify?",
  FALLBACK_RESPONSE: "I'm sorry, I'm not quite sure how to handle that specific request. Could you please provide a bit more detail or clarify what you need?"
};

export interface SopHandlerDependencies {
  strongModel: ChatOpenAI;
  tools: StructuredTool[];
  knowledgeClient: KnowledgeClientService;
}

const logger = new Logger("SopHandlerNode");

export const createSopHandlerNode = (deps: SopHandlerDependencies) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Processing state for session ${state.session_id}`);
    const { strongModel, tools, knowledgeClient } = deps;
    const category = state.current_category;
    const intent = state.current_intent;
    let sop = state.current_sop;
    
    // Fetch SOP if not present and intent is specific
    if (!sop && intent && intent !== "GENERAL_QUERY") {
      try {
        sop = await knowledgeClient.searchInternalSop({
          intentCode: intent,
          requestingAgent: "orchestrator",
        });
      } catch (e) {
        logger.error("Failed to fetch SOP:", e);
      }
    }

    // Use sliding window for context
    const contextMessages = getSlidingWindowMessages(state.messages, 5);
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content as string;

    // Handle Multi-Intent Guidance
    let multiIntentGuidance = "";
    let updatedMultiIntentAcknowledged = state.multi_intent_acknowledged;
    if (state.decomposed_intents.length >= 2 && !state.multi_intent_acknowledged) {
      const otherCategories = state.decomposed_intents.filter(i => i.category !== category).map(i => i.category);
      const allCategories = [category, ...otherCategories];
      multiIntentGuidance = DIALOGUE_PROMPTS.MULTI_INTENT_GUIDANCE
        .replace("{{categories}}", `${allCategories.slice(0, -1).join(", ")} and ${allCategories.slice(-1)}`)
        .replace("{{currentCategory}}", category || "");
      updatedMultiIntentAcknowledged = true;
    }

    const userContext = state.user_orders.length > 0 
      ? `<user_orders>\n${formatOrders(state.user_orders)}\n</user_orders>` 
      : "No recent orders found.";
    const summaryContext = state.summary 
      ? `<summary>\n${state.summary}\n</summary>` 
      : "No previous conversation summary.";
    
    if (sop) {
      let updatedOrderStates = { ...state.order_states };

      // 1. Identify Required Information (Slot Filling) AND Confirmation
      const extractionPrompt = ENTITY_EXTRACTOR_PROMPT
        .replace("{{intentCode}}", intent || "GENERAL")
        .replace("{{requiredData}}", JSON.stringify(sop.requiredData))
        .replace("{{user_context}}", userContext)
        .replace("{{summary}}", summaryContext)
        .replace("{{current_order_states}}", `<current_states>\n${JSON.stringify(state.order_states, null, 2)}\n</current_states>`);

      const extractionResponse = await strongModel.invoke([
        { role: "system", content: extractionPrompt },
        ...contextMessages,
      ]);

      let extractedData: any = {};
      try {
        const jsonStr = extractionResponse.content.toString().match(/\{.*\}/s)?.[0] || "{}";
        extractedData = JSON.parse(jsonStr);
      } catch (e) {
        logger.error("Extraction Parse Error:", e);
      }

      // PERSISTENCE: Merge with existing states
      updatedOrderStates = { ...state.order_states, ...extractedData };
      const isConfirmed = state.is_awaiting_confirmation && extractedData.is_confirmed === true;
      const isRejected = state.is_awaiting_confirmation && extractedData.is_confirmed === false;

      if (isRejected && Object.keys(extractedData).filter(k => k !== 'is_confirmed' && sop.requiredData.includes(k)).length === 0) {
        return {
          partial_responses: [DIALOGUE_PROMPTS.REJECTION_RESPONSE],
          is_awaiting_confirmation: false,
          current_category: null, // Finished (rejected)
          current_intent: null,
          current_sop: null,
          layers: [{ name: "SOP Handler", status: "completed", data: "Confirmation rejected" }]
        };
      }
      
      // 2. Follow SOP: Check for missing data
      const missingData = sop.requiredData.filter((key: string) => !updatedOrderStates[key]);

      if (missingData.length > 0) {
        const prompt = DIALOGUE_PROMPTS.MISSING_DATA
          .replace("{{intent}}", intent?.replace("_", " ").toLowerCase() || "")
          .replace("{{missingField}}", missingData[0]);
        return {
          partial_responses: [multiIntentGuidance + prompt],
          order_states: updatedOrderStates,
          multi_intent_acknowledged: updatedMultiIntentAcknowledged,
          is_awaiting_confirmation: false,
          current_category: category, // Keep category (blocking)
          current_sop: sop, // Persist SOP
          layers: [{ name: "SOP Handler", status: "completed", data: `SOP: ${intent} | Missing: ${missingData.join(", ")}` }]
        };
      }

      // 3. Confirmation Step: If all data gathered but not yet confirmed
      if (!isConfirmed) {
        const summaryList = Object.entries(updatedOrderStates)
          .filter(([key]) => sop.requiredData.includes(key))
          .map(([key, value]) => `- ${key}: ${value}`)
          .join("\n");

        const confirmationPrompt = DIALOGUE_PROMPTS.CONFIRMATION
          .replace("{{intent}}", intent?.replace("_", " ").toLowerCase() || "")
          .replace("{{summaryList}}", summaryList);
        
        return {
          partial_responses: [multiIntentGuidance + confirmationPrompt],
          order_states: updatedOrderStates,
          is_awaiting_confirmation: true,
          multi_intent_acknowledged: updatedMultiIntentAcknowledged,
          current_category: category, // Keep category (blocking)
          current_sop: sop, // Persist SOP
          layers: [{ name: "SOP Handler", status: "completed", data: "Awaiting user confirmation" }]
        };
      }

      // 4. Handoff to other agents (After confirmation)
      const identifier = updatedOrderStates.orderId || state.session_id;
      const idLabel = updatedOrderStates.orderId ? "Order ID" : "Request ID";
      let agentReply = DIALOGUE_PROMPTS.HANDOFF_SUBMITTING
        .replace("{{intent}}", intent?.replace("_", " ").toLowerCase() || "")
        .replace("{{idLabel}}", idLabel)
        .replace("{{identifier}}", identifier);

      // Perform actual handoff if tool exists
      try {
        if (sop.agentOwner === "cancel_order") {
          const tool = tools.find(t => t.name === "Route_To_Logistics");
          if (tool) {
            const toolResult = await tool.invoke({
              action: "cancel_order",
              userId: state.user_id,
              sessionId: state.session_id,
              orderId: updatedOrderStates.orderId,
              description: updatedOrderStates.reason || updatedOrderStates.issueDescription || content
            });
            if (toolResult && !toolResult.includes("Error")) {
              agentReply = DIALOGUE_PROMPTS.HANDOFF_SUCCESS
                .replace("{{intent}}", intent?.replace("_", " ").toLowerCase() || "")
                .replace("{{idLabel}}", idLabel)
                .replace("{{identifier}}", identifier)
                .replace("{{toolResult}}", toolResult);
            } else if (toolResult.includes("Error")) {
              agentReply = toolResult;
            }
          }
        } else if (sop.agentOwner === "request_refund") {
          const tool = tools.find(t => t.name === "Route_To_Resolution");
          if (tool) {
            const toolResult = await tool.invoke({
              action: "request_refund",
              userId: state.user_id,
              sessionId: state.session_id,
              orderId: updatedOrderStates.orderId,
              issueCategory: intent?.toLowerCase().includes("missing") ? "missing_item" : "quality_issue",
              description: updatedOrderStates.reason || updatedOrderStates.issueDescription || content,
              items: updatedOrderStates.missingItems ? [{ name: updatedOrderStates.missingItems, quantity: 1 }] : []
            });
            if (toolResult && !toolResult.includes("Error")) {
              agentReply = DIALOGUE_PROMPTS.HANDOFF_SUCCESS
                .replace("{{intent}}", intent?.replace("_", " ").toLowerCase() || "")
                .replace("{{idLabel}}", idLabel)
                .replace("{{identifier}}", identifier)
                .replace("{{toolResult}}", toolResult);
            } else if (toolResult.includes("Error")) {
              agentReply = toolResult;
            }
          }
        }
      } catch (e) {
        logger.error("Handoff Error:", e);
        agentReply = DIALOGUE_PROMPTS.HANDOFF_ERROR
          .replace("{{idLabel}}", idLabel)
          .replace("{{identifier}}", identifier);
      }

      return {
        partial_responses: [multiIntentGuidance + agentReply],
        current_category: null,
        current_intent: null,
        current_sop: null,
        order_states: updatedOrderStates, // Keep the states for the next intent
        is_awaiting_confirmation: false,
        multi_intent_acknowledged: updatedMultiIntentAcknowledged,
        layers: [{ name: "SOP Handler", status: "completed", data: `Handoff to ${sop.agentOwner}` }]
      };
    }

    // Default fallback if no SOP is active (should be handled by informational_handler, but safety first)
    return {
      partial_responses: [DIALOGUE_PROMPTS.FALLBACK_RESPONSE],
      current_category: null,
      current_intent: null,
      current_sop: null,
      layers: [{ name: "SOP Handler", status: "failed", data: "No active SOP in dialogue node" }]
    };
  };
};
