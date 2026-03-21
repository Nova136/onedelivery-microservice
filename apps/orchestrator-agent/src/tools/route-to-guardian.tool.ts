import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import type { AgentsClientService } from "../modules/agents-client/agents-client.service";

const guardianSchema = z.object({
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
            "The user's request for the Guardian Agent (safety concerns, account issues, escalation, or complaints requiring oversight).",
        ),
});

export function createRouteToGuardianTool(
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async (payload: {
            userId: string;
            sessionId: string;
            message: string;
        }) => {
            try {
                const reply = await agentsClient.send("guardian", {
                    userId: payload.userId,
                    sessionId: payload.sessionId,
                    message: payload.message,
                });
                return reply;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Guardian Agent unreachable. ${msg}`;
            }
        },
        {
            name: "Route_To_Guardian",
            description:
                "Hand off to the Guardian Agent for safety concerns, account or security issues, escalations, or complaints that need oversight or policy enforcement.",
            schema: guardianSchema,
        },
    ) as StructuredTool;
}
