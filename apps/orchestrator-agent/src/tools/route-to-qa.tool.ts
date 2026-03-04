import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import type { AgentsClientService } from "../agents/agents-client.service";

const qaSchema = z.object({
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
            "The user's question or request for the QA Agent (product info, FAQs, quality questions, feedback).",
        ),
});

export function createRouteToQaTool(agentsClient: AgentsClientService): StructuredTool {
    return tool(
        async (payload: { userId: string; sessionId: string; message: string }) => {
            try {
                const reply = await agentsClient.send("qa", {
                    userId: payload.userId,
                    sessionId: payload.sessionId,
                    message: payload.message,
                });
                return reply;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: QA Agent unreachable. ${msg}`;
            }
        },
        {
            name: "Route_To_QA",
            description:
                "Hand off to the QA Agent for product questions, FAQs, quality assurance questions, or general feedback about food or service quality.",
            schema: qaSchema,
        },
    ) as StructuredTool;
}
