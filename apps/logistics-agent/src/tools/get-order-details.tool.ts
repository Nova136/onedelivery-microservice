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
                // const order = await agentsClient.send(
                //     "order",
                //     { cmd: "order.get" },
                //     { orderId },
                // );
                const order = getMockOrder(orderId);

                if (!order) {
                    return `Error: Order ${orderId} not found in database.`;
                }

                // Inject the current time right before returning it to the LLM
                const payloadForLLM = {
                    ...order,
                    serverCurrentTime: new Date().toISOString(),
                };

                return JSON.stringify(payloadForLLM);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Order Microservice unreachable. ${msg}.`;
            }
        },
        {
            name: "Get_Order_Details",
            description:
                "Use this tool to fetch the full details of an order using its ID.",
            schema: getOrderDetailsSchema,
        },
    );
}

// Helper function to dynamically calculate past times
const getRelativeTime = (minutesAgo: number): string => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - minutesAgo);
    return date.toISOString();
};

const getMockOrder = (orderId: string): any | null => {
    const dynamicMocks: Record<string, any> = {
        // Eligible for standard cancellation - still in preparation
        ord_1111: {
            orderId: "ord_1111",
            customerId: "usr_999",
            status: "PREPARATION",
            createdAt: getRelativeTime(20), // Placed 20 mins ago
            updatedAt: getRelativeTime(18), // Updated 18 mins ago
            totalOrderValue: 32.5,
            items: [
                { name: "Spicy Chicken Sandwich", quantity: 2, price: 12.0 },
            ],
        },

        // Not eligible for cancellation - out for delivery but not late yet
        ord_2222: {
            orderId: "ord_2222",
            customerId: "usr_999",
            status: "IN_DELIVERY",
            createdAt: getRelativeTime(90), // Placed 1.5 hours ago
            updatedAt: getRelativeTime(45), // Out for delivery 45 mins ago
            totalOrderValue: 45.0,
            items: [
                { name: "Large Pepperoni Pizza", quantity: 1, price: 25.0 },
            ],
        },

        // Eligible for late cancellation - stuck in delivery for > 3 hours
        ord_3333: {
            orderId: "ord_3333",
            customerId: "usr_999",
            status: "IN_DELIVERY",
            createdAt: getRelativeTime(240), // Placed 4 hours ago!
            updatedAt: getRelativeTime(210), // Stuck in delivery for 3.5 hours!
            totalOrderValue: 18.0,
            items: [{ name: "Pad Thai", quantity: 1, price: 18.0 }],
        },

        // Not eligible for cancellation - already cancelled
        ord_4444: {
            orderId: "ord_4444",
            customerId: "usr_999",
            status: "CANCELLED",
            createdAt: getRelativeTime(120),
            updatedAt: getRelativeTime(110),
            totalOrderValue: 55.0,
            items: [{ name: "Sushi Platter", quantity: 1, price: 55.0 }],
        },
    };

    return dynamicMocks[orderId] || null;
};
