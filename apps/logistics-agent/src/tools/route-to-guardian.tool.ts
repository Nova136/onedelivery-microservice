import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import type { AgentsClientService } from "../agents/agents-client.service";

const guardianSchema = z.object({
    orderId: z.string().describe("The order's unique identifier. REQUIRED."),
});

export function createRouteToGuardianTool(
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async (payload: { orderId: string }) => {
            try {
                // TODO: Implement actual communication with Guardian Agent. For now, we return a placeholder response.
                return "Approved";
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `System Error: Guardian Agent unreachable. ${msg}`;
            }
        },
        {
            name: "Route_To_Guardian",
            description:
                "Use this tool to check the user's cancellation quota and fraud risk with the Guardian Agent before processing a cancellation.",
            schema: guardianSchema,
        },
    ) as StructuredTool;
}
