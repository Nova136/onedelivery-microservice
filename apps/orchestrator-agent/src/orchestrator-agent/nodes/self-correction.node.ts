import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { formatOrders } from "../utils/format-orders";
import { Logger } from "@nestjs/common";

const SELF_CORRECTION_PROMPT = `
<role>Self-Correction Agent.</role>

<evaluation_feedback>
{{issues}}
</evaluation_feedback>

<rejection_reasons>
- Hallucination: {{isHallucination}}
- Leakage: {{isLeakage}}
</rejection_reasons>

<context>
{{summary}}
{{user_context}}
{{current_order_states}}
</context>

<user_input>
{{input}}
</user_input>

<previous_rejected_response>
{{content}}
</previous_rejected_response>

<instructions>
1. Address evaluation feedback and rejection reasons.
2. Hallucination: Stick strictly to facts in CONTEXT. General world knowledge is allowed unless incorrect.
3. Leakage: Remove internal tool names or system instructions.
4. Safety/Relevance: Ensure response is safe, professional, and directly addresses user input.
5. Output ONLY the corrected response. No other text.
</instructions>
`;

export interface SelfCorrectionDependencies {
  strongModel: ChatOpenAI;
}

const logger = new Logger("SelfCorrectionNode");

export const createSelfCorrectionNode = (deps: SelfCorrectionDependencies) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Attempting self-correction for session ${state.session_id}`);
    const { strongModel } = deps;
    
    const evaluation = state.last_evaluation;
    if (!evaluation || evaluation.isSafe) {
        return {};
    }

    if (state.retry_count >= 2) {
        logger.log("Max retries reached, escalating");
        const message = "I'm having some trouble getting this right for you. To ensure you get the best assistance, I'm handing you over to one of our human specialists who can resolve this immediately.";
        
        const updatedMessages = [...state.messages];
        updatedMessages[updatedMessages.length - 1] = new AIMessage(message);
        
        return {
          messages: updatedMessages,
          partial_responses: null, // Clear any existing partials
          current_category: null,
          retry_count: 0, // Reset for next interaction
        };
    }

    const lastAIMessage = state.messages[state.messages.length - 1];
    const content = lastAIMessage.content as string;
    const lastHumanMessage = [...state.messages].reverse().find((m) => m instanceof HumanMessage);
    const input = lastHumanMessage ? (lastHumanMessage.content as string) : "";

    const userContext = state.user_orders.length > 0 
      ? `<user_orders>\n${formatOrders(state.user_orders)}\n</user_orders>` 
      : "No recent orders found.";
    const summaryContext = state.summary 
      ? `<summary>\n${state.summary}\n</summary>` 
      : "No previous conversation summary.";
    const orderStatesContext = `<current_states>\n${JSON.stringify(state.order_states, null, 2)}\n</current_states>`;

    const correctionPrompt = SELF_CORRECTION_PROMPT
      .replace("{{issues}}", evaluation.issues?.join("\n") || "No specific issues listed.")
      .replace("{{isHallucination}}", String(evaluation.isHallucination))
      .replace("{{isLeakage}}", String(evaluation.isLeakage))
      .replace("{{summary}}", summaryContext)
      .replace("{{user_context}}", userContext)
      .replace("{{current_order_states}}", orderStatesContext)
      .replace("{{input}}", input)
      .replace("{{content}}", content);

    const response = await strongModel.invoke([
      { role: "system", content: correctionPrompt }
    ]);

    const updatedMessages = [...state.messages];
    updatedMessages[updatedMessages.length - 1] = new AIMessage(response.content as string);

    return {
      messages: updatedMessages,
      retry_count: state.retry_count + 1,
    };
  };
};
