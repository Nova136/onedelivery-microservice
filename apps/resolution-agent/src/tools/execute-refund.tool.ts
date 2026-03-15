import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import { AgentsClientService } from "../agents/agents-client.service";

const refundSchema = z.object({
    orderId: z.string().describe("The order ID to refund against."),
    amount: z.number().describe("The total amount to be refunded."),
    reason: z.string().describe("The reason for the refund."),
});

export function createExecuteRefundTool(
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async (payload: {
            orderId: string;
            amount: number;
            reason: string;
        }) => {
            try {
                // TODO: Implement actual communication with Payment Service. For now, we return a placeholder response.
                return "Success: Refund processed successfully.";
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `Error: Payment gateway failed. ${msg}`;
            }
        },
        {
            name: "Execute_Refund",
            description: "Processes a refund for a given order ID and amount.",
            schema: refundSchema,
        },
    ) as StructuredTool;
}
