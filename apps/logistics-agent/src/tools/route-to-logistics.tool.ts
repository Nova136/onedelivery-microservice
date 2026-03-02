import { z } from "zod";
import { tool } from "@langchain/core/tools";
import axios from "axios";

export const routeToLogisticsTool = tool(
    async (payload: any) => {
        // Payload e.g.:
        // { action: "check_policy", userId: "user123", question: "How late can I cancel?" }
        // { action: "track_order", userId: "user123", orderId: "123" }
        // { action: "cancel_order", userId: "user123", orderId: "123" }

        // --- MOCK DATA FOR TESTING ---
        console.log(
            "Logistics Tool Mock called with:",
            JSON.stringify(payload, null, 2),
        );

        if (payload.action === "check_policy") {
            return JSON.stringify({
                policy: "You can cancel orders within 10 minutes of placement. Standard delivery time is 30-45 minutes.",
            });
        }

        if (payload.action === "track_order") {
            return JSON.stringify({
                status: "Out for Delivery",
                eta: "12 mins",
                driver: "Sam",
                currentLocation: "Main St & 4th Ave",
            });
        }

        if (payload.action === "cancel_order") {
            return JSON.stringify({
                status: "Cancelled",
                message: `Order ${payload.orderId || "unknown"} has been successfully cancelled.`,
            });
        }

        /*
        try {
            const agentUrls = JSON.parse(process.env.AGENT_URLS || "{}");
            const url = agentUrls.logistics;

            if (!url)
                return "System Error: Logistics Agent URL not configured.";

            const response = await axios.post(`${url}/handle`, payload);
            return JSON.stringify(response.data);
        } catch (error) {
            return "System Error: Logistics Agent unreachable.";
        }
        */
    },
    {
        name: "Route_To_Logistics",
        description:
            "Hand off to Logistics for order tracking, modifying an order, or checking delivery/cancellation policies.",
        schema: z.object({
            // 1. The Intent Flag
            action: z
                .enum(["track_order", "check_policy", "cancel_order"])
                .describe(
                    "The specific task the Logistics Agent needs to perform.",
                ),

            // 2. The Conditional Fields
            userId: z
                .string()
                .describe(
                    "The user's unique identifier. REQUIRED for all actions to help Logistics Agent identify the user and their order history.",
                ),

            orderId: z
                .string()
                .optional()
                .describe(
                    "The order ID. REQUIRED if action is 'track_order' or 'cancel_order'.",
                ),

            question: z
                .string()
                .optional()
                .describe(
                    "The user's specific question. REQUIRED if action is 'check_policy'.",
                ),
        }),
    },
);
