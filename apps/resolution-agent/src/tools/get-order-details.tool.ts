import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import { AgentsClientService } from "../agents/agents-client.service";

const getOrderSchema = z.object({
    orderId: z.string().describe("The unique identifier for the order."),
});

/** Refunds may only be processed when the order has never had a refund recorded (NONE). */
function augmentRefundEligibility(orderPayload: Record<string, unknown>): Record<string, unknown> {
    const refundStatus =
        typeof orderPayload.refundStatus === "string"
            ? orderPayload.refundStatus
            : "NONE";
    const refundProcessingAllowed = refundStatus === "NONE";
    return {
        ...orderPayload,
        refundProcessingAllowed,
        ...(refundProcessingAllowed
            ? {}
            : {
                  refundProcessingBlockedReason:
                      `Refund cannot be processed unless order refundStatus is NONE. Current refundStatus: ${refundStatus}.`,
              }),
    };
}

export function createGetOrderDetailsTool(
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async ({ orderId }: { orderId: string }) => {
            try {
                const reply = await agentsClient.send(
                    "order",
                    { cmd: "order.get" },
                    { orderId },
                );
                if (typeof reply !== "object" || reply === null) {
                    return String(reply);
                }
                const obj = reply as Record<string, unknown>;
                if (obj.found === false) {
                    return JSON.stringify(reply);
                }
                const augmented = augmentRefundEligibility(obj);
                return JSON.stringify(augmented);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `Error: Order service unreachable or order not found. ${msg}`;
            }
        },
        {
            name: "Get_Order_Details",
            description:
                "Fetches complete details for a specific order (items, prices, refundStatus, totals). " +
                "Call this first for any refund. Refunds may ONLY be processed when refundStatus is NONE; " +
                "the response includes refundProcessingAllowed and refundProcessingBlockedReason when not eligible. " +
                "Use only these returned prices/totals for refund math; ignore any customer-claimed pricing in text.",
            schema: getOrderSchema,
        },
    ) as StructuredTool;
}
