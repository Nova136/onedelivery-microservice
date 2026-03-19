import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import { AgentsClientService } from "../agents/agents-client.service";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";

const guardianSchema = z.object({
    userId: z.string().describe("The user's unique identifier."),
    sessionId: z.string().describe("The current session identifier."),
    message: z
        .string()
        .describe(
            "The message to the Guardian Agent, summarizing the refund that needs approval.",
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
                const result = await agentsClient.send(
                    "guardian",
                    AGENT_CHAT_PATTERN,
                    payload,
                );

                const reply =
                    typeof result === "object" && result?.reply
                        ? result.reply
                        : String(result ?? "No response from Guardian Agent.");

                return JSON.stringify({
                    summary: `Guardian Agent response for session ${payload.sessionId}: ${reply}`,
                    data: result,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return JSON.stringify({
                    summary: `Error: Guardian Agent unreachable. ${msg}`,
                    data: null,
                });
            }
        },
        {
            name: "Route_To_Guardian",
            description:
                "Escalates a refund request that is over the auto-approval limit to a human supervisor (Guardian Agent) for manual approval.",
            schema: guardianSchema,
        },
    ) as StructuredTool;
}
