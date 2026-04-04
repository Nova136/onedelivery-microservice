import { AgentCallbackStateType } from "../agent-callback.state";
import { OutputEvaluatorService } from "../../modules/output-evaluator/output-evaluator.service";
import { AuditService } from "../../modules/audit/audit.service";

export interface CallbackEvaluationDependencies {
    outputEvaluator: OutputEvaluatorService;
    auditService: AuditService;
}

export const createCallbackEvaluationNode = (
    deps: CallbackEvaluationDependencies,
) => {
    return async (state: AgentCallbackStateType) => {
        const { outputEvaluator, auditService } = deps;

        if (!state.is_safe) {
            return { is_safe: false };
        }

        const evaluation = await outputEvaluator.evaluateAgentUpdate(
            state.synthesized_message || "",
            `Original Update: ${state.redacted_message}`,
        );

        await auditService.log({
            session_id: state.session_id,
            node: "callback_evaluation",
            action: "evaluate_agent_update",
            input: {
                synthesizedMessage: state.synthesized_message,
                originalUpdate: state.redacted_message,
            },
            output: evaluation,
            metadata: {
                isSafe: evaluation.isSafe,
                biasDetected: evaluation.biasDetected,
            },
        });

        return {
            is_safe: evaluation.isSafe,
        };
    };
};
