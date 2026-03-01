import { z } from "zod";
import { tool } from "@langchain/core/tools";
import axios from "axios";

export const routeToResolutionTool = tool(
    async (payload: any) => {
        // Payload e.g.:
        // { action: "request_refund",  userId: "user123", orderId: "999", issueCategory: "missing_item", description: "The burger was missing.", specificItems: ["burger"], quantity: 1 }
        // { action: "check_refund_status", userId: "user123", orderId: "999" }
        // { action: "check_policy", userId: "user123", question: "What is the refund policy for late deliveries?" }

        // --- MOCK DATA FOR TESTING ---
        console.log(
            "Resolution Tool Mock called with:",
            JSON.stringify(payload, null, 2),
        );

        if (payload.action === "check_policy") {
            return JSON.stringify({
                policy: "We offer full refunds for missing items or wrong orders. Quality issues are reviewed on a case-by-case basis.",
            });
        }

        if (payload.action === "request_refund") {
            return JSON.stringify({
                ticketId: "REF-998877",
                status: "Processing",
                message: `We have received your refund request for ${payload.issueCategory || "your issue"}.`,
            });
        }

        if (payload.action === "check_refund_status") {
            return JSON.stringify({
                status: "Approved",
                amount: 15.5,
                date: new Date().toISOString(),
            });
        }

        /*
        try {
            const agentUrls = JSON.parse(process.env.AGENT_URLS || "{}");
            const url = agentUrls.resolutionRefund;

            if (!url)
                return "System Error: Resolution Agent URL not configured.";

            const response = await axios.post(`${url}/handle`, payload);
            return JSON.stringify(response.data);
        } catch (error) {
            return "System Error: Resolution Agent unreachable.";
        }
        */
    },
    {
        name: "Route_To_Refund",
        description:
            "Hand off to the Resolution Agent when the user wants a refund, check refund status, or to check refund policies.",
        schema: z.object({
            // 1. The Intent Flag
            action: z
                .enum(["request_refund", "check_refund_status", "check_policy"])
                .describe(
                    "The specific task the Resolution Agent needs to perform.",
                ),

            // 2. The Conditional Fields
            userId: z
                .string()
                .describe(
                    "The user's unique identifier. REQUIRED for all actions to help Resolution Agent identify the user and their order history.",
                ),

            orderId: z
                .string()
                .describe(
                    "The order ID. REQUIRED if action is 'request_refund' or 'check_refund_status'.",
                ),

            issueCategory: z
                .enum([
                    "missing_item",
                    "quality_issue",
                    "wrong_item",
                    "late_delivery",
                    "other",
                ])
                .optional()
                .describe(
                    "Categorize the problem. REQUIRED if action is 'request_refund'.",
                ),

            description: z
                .string()
                .optional()
                .describe(
                    "The user's description of the issue in their own words. REQUIRED if action is 'request_refund'.",
                ),

            specificItems: z
                .array(z.string())
                .optional()
                .describe(
                    "A list of the specific food items the user is complaining about (e.g., ['fries', 'diet coke']). REQUIRED if action is 'request_refund'.",
                ),

            quantity: z
                .number()
                .optional()
                .describe(
                    "The quantity of the specific items affected. REQUIRED if action is 'request_refund'.",
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
