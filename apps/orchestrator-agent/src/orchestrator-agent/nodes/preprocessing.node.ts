import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { OrchestratorStateType } from "../state";
import { PiiRedactionService } from "../../modules/pii-redaction/pii-redaction.service";
import { InputValidatorService } from "../../modules/input-validator/input-validator.service";
import { OrderClientService } from "../../modules/clients/order-client/order-client.service";

export interface PreprocessingDependencies {
    piiService: PiiRedactionService;
    inputValidator: InputValidatorService;
    orderService: OrderClientService;
}

export const createPreprocessingNode = (deps: PreprocessingDependencies) => {
    return async (state: OrchestratorStateType) => {
        const { inputValidator, orderService } = deps;
        const lastMessage = state.messages[state.messages.length - 1];

        if (!(lastMessage instanceof HumanMessage)) {
            return {
                layers: [
                    {
                        name: "Preprocessing",
                        status: "completed",
                        data: "Skipped (not a human message)",
                    },
                ],
            };
        }

        const content = lastMessage.content as string;

        // 1. Fetch context (PII already redacted in OrchestratorService)
        let orders: any[] = [];

        try {
            orders = await orderService.getRecentOrders(state.user_id);
        } catch (e) {
            console.error("Preprocessing: Order Service failed", e);
        }

        // 2. Validate the content
        const validationResult = await inputValidator.validateMessage(content);

        // Handle Validation Failure
        if (!validationResult.isValid) {
            return {
                messages: [
                    new AIMessage(
                        `I'm sorry, but I cannot process that request: ${validationResult.error}`,
                    ),
                ],
                user_orders: orders,
                is_input_valid: false,
                layers: [
                    {
                        name: "Preprocessing",
                        status: "failed",
                        data: `Validation failed: ${validationResult.error}`,
                    },
                ],
            };
        }

        return {
            user_orders: orders,
            is_input_valid: true,
            layers: [
                {
                    name: "Preprocessing",
                    status: "completed",
                    data: `Orders: ${orders.length}, Valid: true`,
                },
            ],
        };
    };
};
