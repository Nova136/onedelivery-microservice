import { AgentCallbackStateType } from "../agent-callback.state";
import { OutputEvaluatorService } from "../../modules/output-evaluator/output-evaluator.service";

export interface CallbackEvaluationDependencies {
    outputEvaluator: OutputEvaluatorService;
}

export const createCallbackEvaluationNode = (deps: CallbackEvaluationDependencies) => {
    return async (state: AgentCallbackStateType) => {
        const { outputEvaluator } = deps;

        if (!state.is_safe) {
            return { is_safe: false };
        }

        const evaluation = await outputEvaluator.evaluateAgentUpdate(
            state.synthesized_message || "",
            `Summary: ${state.summary}`
        );

        return {
            is_safe: evaluation.isSafe,
        };
    };
};
