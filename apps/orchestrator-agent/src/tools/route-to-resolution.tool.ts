import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import type { AgentsClientService } from "../agents/agents-client.service";

/** Explicit payload type to avoid deep type instantiation with tool() */
interface ResolutionPayload {
    action: "request_refund" | "check_refund_status";
    userId: string;
    sessionId: string;
    orderId?: string;
    issueCategory?:
        | "missing_item"
        | "quality_issue"
        | "wrong_item"
        | "late_delivery"
        | "other";
    description?: string;
    specificItems?: string[];
    quantity?: number;
    question?: string;
}

const resolutionSchema = z.object({
    action: z
        .enum(["request_refund", "check_refund_status"])
        .describe("The specific task the Resolution Agent needs to perform."),
    userId: z
        .string()
        .describe(
            "The user's unique identifier. REQUIRED for all actions to help Resolution Agent identify the user and their order history.",
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
});

export function createRouteToResolutionTool(
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async (payload: ResolutionPayload) => {
            try {
                const reply = await agentsClient.send("resolution", {
                    userId: payload.userId,
                    sessionId: payload.sessionId,
                    message: JSON.stringify(payload),
                });
                return reply;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Resolution Agent unreachable. ${msg}`;
            }
        },
        {
            name: "Route_To_Refund",
            description:
                "Hand off to the Resolution Agent when the user wants a refund, check refund status, or to check refund policies.",
            schema: resolutionSchema as z.ZodType<ResolutionPayload>,
        },
    ) as StructuredTool;
}
