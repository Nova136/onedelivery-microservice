import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import type { AgentsClientService } from "../modules/agents-client/agents-client.service";

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
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async (payload: {
            userId: string;
            sessionId: string;
            message: string;
        }) => {
            try {
                // TODO: Implement actual communication with Escalation Service. For now, we return a placeholder response.
                return "Success: Escalation requested.";
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Escalation service unreachable. ${msg}`;
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
