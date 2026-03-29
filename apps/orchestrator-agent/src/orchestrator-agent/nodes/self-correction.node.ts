import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "@nestjs/common";
import { OrchestratorStateType } from "../state";

const SELF_CORRECTION_PROMPT = `
<role>Self-Correction Agent for OneDelivery.</role>

<context>
{{context}}
</context>

<user_input>
{{input}}
</user_input>

<ai_response_to_correct>
{{output}}
</ai_response_to_correct>

<evaluation_issues>
{{issues}}
</evaluation_issues>

<instructions>
1. **Analyze**: Review the issues identified in the AI response.
2. **Correct**: Generate a corrected, accurate, and safe response that addresses the user's input while adhering to OneDelivery's guidelines.
3. **Hallucination Prevention**: If the AI response claims an action was performed (e.g., "order canceled") but the context does not confirm it, DO NOT hallucinate success. Instead, explain that the action is still in progress or requires further steps.
4. **Output**: Return ONLY the corrected response text. Do not include any other text, explanations, or markdown formatting.
</instructions>
`;

export interface SelfCorrectionDependencies {
  strongModel: BaseChatModel;
}

const logger = new Logger("SelfCorrectionNode");

export const createSelfCorrectionNode = (deps: SelfCorrectionDependencies) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Self-correcting output for session ${state.session_id}`);
    const { strongModel } = deps;
    
    const lastMessage = state.messages[state.messages.length - 1];
    const output = lastMessage.content as string;
    const input = state.messages[state.messages.length - 2]?.content as string || "";
    const context = state.summary || "";
    const issues = state.last_evaluation?.issues?.join(", ") || "Unknown issues";

    const prompt = SELF_CORRECTION_PROMPT
      .replace("{{context}}", context)
      .replace("{{input}}", input)
      .replace("{{output}}", output)
      .replace("{{issues}}", issues);

    let correctedResponse = "";
    try {
      const response = await strongModel.invoke([
        { role: "system", content: prompt },
      ]);
      correctedResponse = response.content.toString().trim();
    } catch (e) {
      logger.error("All models failed for SelfCorrection:", e);
      // If both fail, keep the original output but maybe redact it or just let it be
      correctedResponse = output;
    }
    
    const updatedMessages = [...state.messages];
    updatedMessages[updatedMessages.length - 1] = new AIMessage(correctedResponse);

    return {
      messages: updatedMessages,
      retry_count: (state.retry_count || 0) + 1
    };
  };
};
