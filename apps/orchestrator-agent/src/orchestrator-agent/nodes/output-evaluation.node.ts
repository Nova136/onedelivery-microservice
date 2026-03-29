import { Logger } from "@nestjs/common";
import { OrchestratorStateType } from "../state";
import { getSlidingWindowMessages } from "../utils/message-window";
import { HumanMessage } from "@langchain/core/messages";

export interface OutputEvaluationDependencies {
    outputEvaluator: any; // Using any for now as I don't have the exact type
}

const logger = new Logger("OutputEvaluationNode");

export const createOutputEvaluationNode = (
    deps: OutputEvaluationDependencies,
) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Evaluating output for session ${state.session_id}`);
        const { outputEvaluator } = deps;

        const lastMessage = state.messages[state.messages.length - 1];
        const output = lastMessage.content as string;
        const input =
            (state.messages[state.messages.length - 2]?.content as string) ||
            "";

        // Include recent chat history in the context for better evaluation
        const recentMessages = getSlidingWindowMessages(state.messages, 5);
        const historyContext = recentMessages
            .map(
                (m) =>
                    `${m instanceof HumanMessage ? "User" : "AI"}: ${m.content}`,
            )
            .join("\n");

        const context = `
Summary: ${state.summary || "None"}
Current Intent: ${state.current_intent || "None"}
Gathered Data: ${JSON.stringify(state.order_states || {})}
Recent History:
${historyContext}
`.trim();

        const evaluation = await outputEvaluator.evaluateOutput(
            output,
            input,
            context,
        );

        return {
            last_evaluation: evaluation,
            retry_count: state.retry_count || 0,
        };
    };
};
