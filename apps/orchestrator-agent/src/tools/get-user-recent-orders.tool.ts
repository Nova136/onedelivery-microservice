import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { AgentsClientService } from "../modules/agents-client/agents-client.service";

const getUserRecentOrdersSchema = z
    .object({
        userId: z
            .string()
            .describe("The unique ID of the user to fetch orders for."),
    })
    .describe("Input to fetch the recent orders for a user.");

export function createGetUserRecentOrdersTool(
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async ({ userId }: { userId: string }) => {
            try {
                // NOTE: You will need to implement `getUserRecentOrders` in your AgentsClientService
                // to call the Order Microservice via TCP (e.g., using the 'order.list' pattern).
                const orders = await (agentsClient as any).getUserRecentOrders(
                    userId,
                );

                if (!orders || orders.length === 0) {
                    return `No recent orders found for user ${userId}.`;
                }

                // Format the orders into a clear string for the LLM to read
                const formattedOrders = orders
                    .map(
                        (o: any) =>
                            `- Order ID: ${o.id} | Status: ${o.status} | Total: $${o.totalAmount} | Created: ${o.createdAt}`,
                    )
                    .join("\n");

                return `Recent orders for user ${userId}:\n${formattedOrders}\n\nUse these order details to assist the user contextually without asking them for their Order ID.`;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Unable to fetch recent orders. ${msg}`;
            }
        },
        {
            name: "Get_User_Recent_Orders",
            description:
                "Use this tool to fetch a list of the user's recent orders. ALWAYS use this if the user asks about an order (e.g., 'Where is my food?', 'Cancel my order') but does not provide the Order ID.",
            schema: getUserRecentOrdersSchema,
        },
    );
}
