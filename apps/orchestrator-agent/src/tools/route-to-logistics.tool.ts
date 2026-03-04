import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import type { AgentsClientService } from "../agents/agents-client.service";

/** Explicit payload type to avoid deep type instantiation with tool() */
interface LogisticsPayload {
    action: "track_order" | "check_policy" | "cancel_order";
    userId: string;
    sessionId: string;
    orderId?: string;
    question?: string;
}

const logisticsSchema = z.object({
    action: z
        .enum(["track_order", "check_policy", "cancel_order"])
        .describe(
            "The specific task the Logistics Agent needs to perform.",
        ),
    userId: z
        .string()
        .describe(
            "The user's unique identifier. REQUIRED for all actions to help Logistics Agent identify the user and their order history.",
        ),
    sessionId: z
        .string()
        .describe(
            "The session identifier. REQUIRED. Pass the exact sessionId from context.",
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
});

export function createRouteToLogisticsTool(agentsClient: AgentsClientService): StructuredTool {
    return tool(
        async (payload: LogisticsPayload) => {
            try {
                const reply = await agentsClient.send("logistic", {
                    userId: payload.userId,
                    sessionId: payload.sessionId,
                    message: JSON.stringify(payload),
                });
                return reply;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Logistics Agent unreachable. ${msg}`;
            }
        },
        {
            name: "Route_To_Logistics",
            description:
                "Hand off to Logistics for order tracking, modifying an order, or checking delivery/cancellation policies.",
            schema: logisticsSchema as z.ZodType<LogisticsPayload>,
        },
    ) as StructuredTool;
}
