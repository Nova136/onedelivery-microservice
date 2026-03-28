import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { OutputEvaluatorService } from "../../modules/output-evaluator/output-evaluator.service";
import { formatOrders } from "../utils/format-orders";
import { Logger } from "@nestjs/common";

export interface OutputEvaluationDependencies {
  outputEvaluator: OutputEvaluatorService;
}

const logger = new Logger("OutputEvaluationNode");

export const createOutputEvaluationNode = (deps: OutputEvaluationDependencies) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Evaluating output for session ${state.session_id}`);
    const { outputEvaluator } = deps;

    const lastAIMessage = state.messages[state.messages.length - 1];
    if (!(lastAIMessage instanceof AIMessage)) {
        return {};
    }

    const content = lastAIMessage.content as string;
    const lastHumanMessage = [...state.messages].reverse().find((m) => m instanceof HumanMessage);
    const input = lastHumanMessage ? (lastHumanMessage.content as string) : "";
    const context = `Summary: ${state.summary}\nUser Orders: ${formatOrders(state.user_orders)}\nOrder States: ${JSON.stringify(state.order_states)}`;

    const evaluation = await outputEvaluator.evaluateOutput(content, input, context);

    return {
      last_evaluation: evaluation
    };
  };
};
