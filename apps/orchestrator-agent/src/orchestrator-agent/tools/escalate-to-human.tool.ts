import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import { MemoryClientService } from "../../modules/clients/memory-client/memory-client.service";

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

export function createEscalateToHumanTool(
    memoryService: MemoryClientService,
): StructuredTool {
    return tool(
        async (payload: {
            userId: string;
            sessionId: string;
            message: string;
        }) => {
            try {
                // Update the session status to escalated in the database
                await memoryService.escalateSession(
                    payload.userId,
                    payload.sessionId,
                );
                return "I understand this situation needs personal attention. I'm escalating your case to our support team now — a human agent will review your conversation and follow up with you shortly.";
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`Escalate to Human Error: ${msg}`);
                return "I'm trying to connect you with a human agent, but we are experiencing technical difficulties. Please hold on.";
            }
        },
        {
            name: "Escalate_To_Human",
            description:
                "Use this tool when a user explicitly asks for a human, is highly abusive, or when an SOP instructs you to offer a transfer to human support.",
            schema: escalateSchema,
        },
    ) as StructuredTool;
}
