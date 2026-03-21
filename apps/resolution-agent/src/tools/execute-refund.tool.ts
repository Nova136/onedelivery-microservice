import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import { AgentsClientService } from "../agents/agents-client.service";

const refundItemSchema = z.object({
    orderItemId: z.string().describe("The ID of the order item to refund."),
    quantity: z
        .number()
        .int()
        .min(1)
        .describe("Number of units to refund for this item."),
});

const refundSchema = z.object({
    orderId: z.string().describe("The order ID to refund against."),
    items: z
        .array(refundItemSchema)
        .min(1)
        .describe(
            "List of order items and quantities to refund. Each entry specifies which item and how many units.",
        ),
    reason: z
        .string()
        .describe(
            "The reason for the refund, including which item(s) are affected.",
        ),
});

export function createExecuteRefundTool(
    agentsClient: AgentsClientService,
): StructuredTool {
    return tool(
        async (payload: {
            orderId: string;
            items: { orderItemId: string; quantity: number }[];
            reason: string;
        }) => {
            const { orderId, items: refundItems, reason } = payload;

            try {
                const orderLookup = await agentsClient.send(
                    "order",
                    { cmd: "order.get" },
                    { orderId },
                );

                if (!orderLookup || orderLookup.found === false) {
                    return JSON.stringify({
                        summary: `Error: Order ${orderId} not found.`,
                        data: null,
                    });
                }

                const refundStatus =
                    (orderLookup as { refundStatus?: string }).refundStatus ??
                    "NONE";
                if (refundStatus !== "NONE") {
                    return JSON.stringify({
                        summary:
                            `REJECTED: Refunds can only be processed when order refundStatus is NONE. ` +
                            `Current refundStatus: ${refundStatus}.`,
                        data: {
                            rejected: true,
                            code: "REFUND_STATUS_NOT_NONE",
                        },
                    });
                }

                const orderItems: Array<{
                    id: string;
                    quantityOrdered: number;
                    quantityRefunded: number;
                    price: number;
                    productName: string;
                }> = orderLookup.items ?? [];

                const validationErrors: string[] = [];
                let totalRefundAmount = 0;
                const validatedItems: {
                    orderItemId: string;
                    quantity: number;
                }[] = [];

                for (const ri of refundItems) {
                    const item = orderItems.find(
                        (oi) => oi.id === ri.orderItemId,
                    );
                    if (!item) {
                        validationErrors.push(
                            `Item ${ri.orderItemId} not found in order.`,
                        );
                        continue;
                    }

                    const remaining =
                        item.quantityOrdered - item.quantityRefunded;
                    if (remaining <= 0) {
                        validationErrors.push(
                            `Item "${item.productName}" (${ri.orderItemId}) is already fully refunded ` +
                                `(${item.quantityRefunded}/${item.quantityOrdered}).`,
                        );
                        continue;
                    }

                    if (ri.quantity > remaining) {
                        validationErrors.push(
                            `Item "${item.productName}" (${ri.orderItemId}): requested ${ri.quantity} ` +
                                `but only ${remaining} unit(s) eligible (${item.quantityRefunded} already refunded ` +
                                `out of ${item.quantityOrdered}).`,
                        );
                        continue;
                    }

                    totalRefundAmount += ri.quantity * Number(item.price);
                    validatedItems.push({
                        orderItemId: ri.orderItemId,
                        quantity: ri.quantity,
                    });
                }

                if (validationErrors.length > 0) {
                    return JSON.stringify({
                        summary:
                            `Refund validation failed for order ${orderId}: ` +
                            validationErrors.join(" | "),
                        data: { validationErrors },
                    });
                }

                const totalCents = Math.round(totalRefundAmount * 100);
                const autoApprovalLimitCents = 20 * 100;
                if (totalCents > autoApprovalLimitCents) {
                    return JSON.stringify({
                        summary:
                            `REJECTED: Refund amount exceeds the $20 auto-approval limit; this request requires manual review. ` +
                            `(Calculated $${totalRefundAmount.toFixed(2)}.)`,
                        data: {
                            rejected: true,
                            code: "OVER_AUTO_APPROVAL_LIMIT",
                        },
                    });
                }

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
                    {
                        paymentId,
                        amount: totalRefundAmount,
                        reason,
                    },
                );

                await agentsClient.send(
                    "order",
                    { cmd: "order.updateRefund" },
                    { orderId, items: validatedItems },
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
                "Refunds are only allowed when the order's refundStatus is NONE. " +
                "Validates that each item has not been fully refunded and that the requested quantity " +
                "does not exceed remaining eligible units. Automatically computes the refund amount " +
                "from item prices and updates order item refund quantities after success. " +
                "Returns a JSON object with a human-readable summary and the raw payment service response.",
            schema: refundSchema,
        },
    ) as StructuredTool;
}
