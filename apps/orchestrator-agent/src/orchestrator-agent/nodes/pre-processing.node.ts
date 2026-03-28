import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { InputValidatorService } from "../../modules/input-validator/input-validator.service";
import { OrderClientService } from "../../modules/clients/order-client/order-client.service";
import { Logger } from "@nestjs/common";

export interface PreProcessingDependencies {
  inputValidator: InputValidatorService;
  orderService: OrderClientService;
}

const logger = new Logger("PreProcessingNode");

export const createPreProcessingNode = (deps: PreProcessingDependencies) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Processing state for session ${state.session_id}`);
    const { inputValidator, orderService } = deps;
    const lastMessage = state.messages[state.messages.length - 1];
    
    if (!(lastMessage instanceof HumanMessage)) {
      return {
        layers: [{ name: "Preprocessing", status: "completed", data: "Skipped (not a human message)" }]
      };
    }

    const content = lastMessage.content as string;

    // 1. Fetch context and validate in parallel
    const [ordersResult, validationResult] = await Promise.allSettled([
      orderService.getRecentOrders(state.user_id),
      inputValidator.validateMessage(content)
    ]);

    let orders: any[] = [];
    if (ordersResult.status === 'fulfilled') {
      orders = ordersResult.value;
    } else {
      logger.error("Preprocessing: Order Service failed", ordersResult.reason);
    }

    const validation = validationResult.status === 'fulfilled' 
      ? validationResult.value 
      : { isValid: false, error: 'Validation service failed' };

    // Handle Validation Failure
    if (!validation.isValid) {
      return {
        messages: [new AIMessage(`I'm sorry, but I cannot process that request: ${validation.error}`)],
        user_orders: orders,
        is_input_valid: false,
        layers: [
          { name: "Preprocessing", status: "failed", data: `Validation failed: ${validation.error}` }
        ]
      };
    }

    return {
      user_orders: orders,
      is_input_valid: true,
      layers: [
        { 
          name: "Preprocessing", 
          status: "completed", 
          data: `Orders: ${orders.length}, Valid: true` 
        }
      ]
    };
  };
};
