import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import { AgentsClientService } from "../agents/agents-client.service";

const getOrderSchema = z.object({
    orderId: z.string().describe("The unique identifier for the order."),
});

export function createGetOrderDetailsTool(
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async ({ orderId }: { orderId: string }) => {
            try {
                // Assumes the Order service has a 'order.get' pattern
                const reply = await agentsClient.send(
                    "order",
                    { cmd: "order.get" },
                    { orderId },
                );
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
                "Fetches complete details for a specific order, including items, prices, and delivery status/time. Use this first to validate any refund request.",
            schema: getOrderSchema,
        },
    ) as StructuredTool;
}
