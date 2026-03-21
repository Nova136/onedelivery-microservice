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
                "the response includes refundProcessingAllowed and refundProcessingBlockedReason when not eligible.",
            schema: getOrderSchema,
        },
    ) as StructuredTool;
}

// The "Perfectly Eligible" Order
const mockOrderResponse1 = {
    id: "ord_550e8400-e29b-41d4-a716-446655440000",
    customerId: "usr_98765",
    status: "DELIVERED",
    deliveryAddress: "123 Marina Bay Sands, Tower 1",
    transactionId: "txn_abc123xyz",
    createdAt: "2026-03-15T12:30:00Z",
    updatedAt: "2026-03-15T13:15:00Z",
    totalOrderValue: 45.5,
    totalRefundValue: 0.0,
    refundStatus: "NONE",
    items: [
        {
            id: "item_1111",
            productId: "prod_burger",
            price: 15.0,
            quantityOrdered: 2,
            quantityRefunded: 0,
            itemValue: 30.0,
        },
        {
            id: "item_2222",
            productId: "prod_fries",
            price: 5.5,
            quantityOrdered: 1,
            quantityRefunded: 0,
            itemValue: 5.5,
        },
        {
            id: "item_3333",
            productId: "prod_shake",
            price: 10.0,
            quantityOrdered: 1,
            quantityRefunded: 0,
            itemValue: 10.0,
        },
    ],
};
// The "Eligible But Partially Refunded" Order
const mockOrderResponse2 = {
    id: "ord_999e8400-e29b-41d4-a716-446655449999",
    customerId: "usr_98765",
    status: "DELIVERED",
    deliveryAddress: "123 Marina Bay Sands, Tower 1",
    transactionId: "txn_def456uvw",
    createdAt: "2026-03-15T11:00:00Z",
    updatedAt: "2026-03-15T11:45:00Z",
    totalOrderValue: 35.0,
    totalRefundValue: 15.0,
    refundStatus: "PARTIAL",
    items: [
        {
            id: "item_4444",
            productId: "prod_burger",
            price: 15.0,
            quantityOrdered: 2,
            quantityRefunded: 1,
            itemValue: 30.0,
        },
        {
            id: "item_5555",
            productId: "prod_coke",
            price: 5.0,
            quantityOrdered: 1,
            quantityRefunded: 0,
            itemValue: 5.0,
        },
    ],
};
// The "Eligible But Already Refunded" Order
const mockOrderResponse3 = {
    id: "ord_777e8400-e29b-41d4-a716-446655447777",
    customerId: "usr_11223",
    status: "DELIVERED",
    deliveryAddress: "456 Orchard Road",
    transactionId: "txn_ghi789rst",
    createdAt: "2026-03-14T18:00:00Z",
    updatedAt: "2026-03-14T19:20:00Z",
    totalOrderValue: 25.0,
    totalRefundValue: 25.0,
    refundStatus: "FULL",
    items: [
        {
            id: "item_6666",
            productId: "prod_pizza",
            price: 25.0,
            quantityOrdered: 1,
            quantityRefunded: 1,
            itemValue: 25.0,
        },
    ],
};
// The "Not Eligible - Still On The Way" Order
const mockOrderResponse4 = {
    id: "ord_333e8400-e29b-41d4-a716-446655443333",
    customerId: "usr_44556",
    status: "ON_THE_WAY",
    deliveryAddress: "789 Sentosa Cove",
    transactionId: "txn_jkl012mno",
    createdAt: "2026-03-15T14:10:00Z",
    updatedAt: "2026-03-15T14:15:00Z",
    totalOrderValue: 18.5,
    totalRefundValue: 0.0,
    refundStatus: "NONE",
    items: [
        {
            id: "item_7777",
            productId: "prod_salad",
            price: 18.5,
            quantityOrdered: 1,
            quantityRefunded: 0,
            itemValue: 18.5,
        },
    ],
};

