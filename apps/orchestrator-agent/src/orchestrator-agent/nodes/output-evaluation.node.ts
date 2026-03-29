import { Logger } from "@nestjs/common";
import { OrchestratorStateType } from "../state";

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
        const context = state.summary || "";

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
