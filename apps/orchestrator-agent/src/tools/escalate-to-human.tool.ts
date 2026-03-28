import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";

const escalateSchema = z.object({
    userId: z
        .string()
        .describe(
            "The user's unique identifier. REQUIRED. Pass the exact userId from context.",
        ),
    sessionId: z
        .string()
        .describe(
            "The session identifier. REQUIRED. Pass the exact sessionId from context.",
        ),
    message: z
        .string()
        .describe(
            "A summary of the user's issue and the reason for escalation.",
        ),
});

export function createEscalateToHumanTool(): StructuredTool {
    return tool(
        async (_payload: {
            userId: string;
            sessionId: string;
            message: string;
        }) => {
            // TODO: Implement actual routing to human agent queue (e.g. ticketing system,
            // live chat handoff, or CRM escalation). This is a planned future feature.
            return "I understand this situation needs personal attention. I'm escalating your case to our support team now — a human agent will review your conversation and follow up with you shortly.";
        },
        {
            name: "Escalate_To_Human",
            description:
                "Use this tool when a user explicitly asks for a human, is highly abusive, or when an SOP instructs you to offer a transfer to human support.",
            schema: escalateSchema,
        },
    ) as StructuredTool;
}
