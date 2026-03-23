import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { OrderClientService } from "../agents/order-client.service";

const getOrderDetailsSchema = z
    .object({
        orderId: z.string().describe("The unique identifier for the order."),
    })
    .describe("Input to get the details of a specific order.");

export function createGetOrderDetailsTool(
    orderClient: OrderClientService,
): StructuredTool {
    return tool(
        async ({ orderId }: { orderId: string }) => {
            try {
                // Assumes the Order service has a 'order.get' pattern
                const reply = await orderClient.getOrderDetails(orderId);
                // The agent expects a string, so we stringify the JSON response
                return typeof reply === "object"
                    ? JSON.stringify(reply)
                    : String(reply);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `Error: Order service unreachable or order not found. ${msg}`;
            }
        },
        {
            name: "Get_Order_Details",
            description:
                "Fetches complete details for a specific order, including items, prices, and delivery status/time. Use this first to validate any request.",
            schema: getOrderDetailsSchema,
        },
    ) as StructuredTool;
}
