import { z } from "zod";
import { tool } from "@langchain/core/tools";
import axios from "axios";

export const routeToLogisticsTool = tool(
    async (payload: any) => {
        // Payload e.g.:
        // { action: "check_policy", userId: "user123", question: "How late can I cancel?" }
        // { action: "track_order", userId: "user123", orderId: "123" }
        // { action: "cancel_order", userId: "user123", orderId: "123" }

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
