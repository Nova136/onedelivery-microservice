import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { OrderClientService } from "../agents/order-client.service";

const executeCancellationSchema = z
    .object({
        orderId: z
            .string()
            .describe("The unique identifier for the order to be cancelled."),
    })
    .describe(
        "Input to execute the cancellation of an order and trigger a refund.",
    );

export function createExecuteCancellationTool(
    orderClient: OrderClientService,
): StructuredTool {
    return tool(
        async ({ orderId }: { orderId: string }) => {
            // TODO: Implement the actual cancellation logic. For now, we return a placeholder response.
            try {
                const result = await orderClient.executeCancellation(orderId);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Unable to execute cancellation. ${msg}.`;
            }
            return "Successfully cancelled order and initiated refund.";
        },
        {
            name: "Execute_Cancellation_And_Refund",
            description:
                "Use this tool to finalize the order cancellation and initiate a full refund AFTER getting approval from the Guardian Agent.",
            schema: executeCancellationSchema,
        },
    );
}
