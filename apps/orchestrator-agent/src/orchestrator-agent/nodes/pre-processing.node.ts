import { HumanMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { OrderClientService } from "../../modules/clients/order-client/order-client.service";
import { Logger } from "@nestjs/common";

export interface PreProcessingDependencies {
    orderService: OrderClientService;
}

const logger = new Logger("PreProcessingNode");

export const createPreProcessingNode = (deps: PreProcessingDependencies) => {
    return async (state: OrchestratorStateType) => {
        logger.log(`Processing state for session ${state.session_id}`);
        const { orderService } = deps;
        const lastMessage = state.messages[state.messages.length - 1];

        if (!(lastMessage instanceof HumanMessage)) {
            return {};
        }

        // Fetch context
        const ordersResult = await orderService.getRecentOrders(state.user_id);

        return {
            user_orders: ordersResult,
            is_input_valid: true,
            retrieved_context: null,
        };
    };
};
