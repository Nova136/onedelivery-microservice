import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import type { AgentsClientService } from "../agents/agents-client.service";

interface ItemDetail {
    name: string;
    quantity: number;
}

/** Explicit payload type to avoid deep type instantiation with tool() */
interface ResolutionPayload {
    action: "request_refund";
    userId: string;
    sessionId: string;
    orderId?: string;
    issueCategory?:
        | "missing_item"
        | "wrong_item"
        | "quality_issue"
        | "late_delivery";
    description?: string;
    items?: ItemDetail[];
    question?: string;
}

const resolutionSchema = z.object({
    action: z
        .enum(["request_refund"])
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
        .describe("The order ID. REQUIRED if action is 'request_refund'."),
    issueCategory: z
        .enum(["missing_item", "wrong_item", "quality_issue", "late_delivery"])
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
    items: z
        .array(
            z.object({
                name: z.string().describe("The name of the affected item."),
                quantity: z
                    .number()
                    .describe("The quantity of this specific item affected."),
            }),
        )
        .optional()
        .describe(
            "An array of objects, where each object contains the name and quantity of an affected item. REQUIRED if action is 'request_refund'.",
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
            name: "Route_To_Resolution",
            description:
                "Hand off to the Resolution Agent when the user wants a refund for an order issue.",
            schema: resolutionSchema as z.ZodType<ResolutionPayload>,
        },
    ) as StructuredTool;
}
