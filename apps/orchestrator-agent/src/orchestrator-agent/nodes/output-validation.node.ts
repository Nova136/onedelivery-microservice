import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { OutputEvaluatorService } from "../../modules/output-evaluator/output-evaluator.service";
import { formatOrders } from "../utils/format-orders";

export const createOutputValidationNode = (
    outputEvaluator: OutputEvaluatorService,
) => {
    return async (state: OrchestratorStateType) => {
        console.log(
            `OutputValidationNode: processing state for session ${state.session_id}`,
        );
        const lastAIMessage = state.messages[state.messages.length - 1];
        if (!(lastAIMessage instanceof AIMessage)) return {};

        const content = lastAIMessage.content as string;
        const lastHumanMessage = [...state.messages]
            .reverse()
            .find((m) => m instanceof HumanMessage);
        const input = lastHumanMessage
            ? (lastHumanMessage.content as string)
            : "";
        const context = `Summary: ${state.summary}\nUser Orders: ${formatOrders(state.user_orders)}\nOrder States: ${JSON.stringify(state.order_states)}`;

        const evaluation = await outputEvaluator.evaluateOutput(
            content,
            input,
            context,
        );

        return {
            last_evaluation: evaluation,
            layers: [
                {
                    name: "Output Validation",
                    status: evaluation.isSafe ? "completed" : "failed",
                    data: evaluation.isSafe
                        ? `Score: ${evaluation.score}`
                        : evaluation.issues?.join(", "),
                },
            ],
        };
    };
};
