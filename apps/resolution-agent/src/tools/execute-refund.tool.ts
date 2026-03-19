import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import { AgentsClientService } from "../agents/agents-client.service";

const refundSchema = z.object({
    orderId: z.string().describe("The order ID to refund against."),
    amount: z
        .number()
        .describe(
            "Total refund amount for the selected item(s) of the order. The caller is responsible for computing the correct amount based on item-level selection.",
        ),
    reason: z
        .string()
        .describe("The reason for the refund, including which item(s) are affected."),
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
            const { orderId, amount, reason } = payload;

            try {
                const paymentLookup = await agentsClient.send(
                    "payment",
                    { cmd: "payment.getByOrder" },
                    { orderId },
                );

                if (!paymentLookup || paymentLookup.found === false) {
                    return JSON.stringify({
                        summary: `Error: No payment found for order ${orderId}.`,
                        data: null,
                    });
                }

                const { paymentId } = paymentLookup;

                const refundResponse = await agentsClient.send(
                    "payment",
                    { cmd: "payment.refund" },
                    { paymentId, amount, reason },
                );

                const summary =
                    `Refund ${refundResponse.status} for order ${orderId}: ` +
                    `$${refundResponse.amount}. RefundId=${refundResponse.refundId}.`;

                return JSON.stringify({ summary, data: refundResponse });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);

                if (msg.includes("not found") || msg.includes("No payment")) {
                    return JSON.stringify({
                        summary: `Error: No payment record found for order ${orderId}.`,
                        data: null,
                    });
                }
                if (msg.includes("declined") || msg.includes("rejected")) {
                    return JSON.stringify({
                        summary: `Error: Refund declined for order ${orderId}. ${msg}`,
                        data: null,
                    });
                }

                return JSON.stringify({
                    summary: `Error: Payment service unreachable or unexpected failure. ${msg}`,
                    data: null,
                });
            }
        },
        {
            name: "Execute_Refund",
            description:
                "Processes an item-level refund against the payment service for a given order. " +
                "Item selection and amount calculation should be done before calling this tool. " +
                "Returns a JSON object with a human-readable summary and the raw payment service response.",
            schema: refundSchema,
        },
    ) as StructuredTool;
}
