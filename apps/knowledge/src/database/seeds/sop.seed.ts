import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Sop } from "../entities/sop.entity";

export default class SopSeeder implements Seeder {
    public async run(dataSource: DataSource): Promise<void> {
        const repo = dataSource.getRepository(Sop);

        // Clear existing SOP data to ensure updates to this file are always applied
        console.log("Clearing existing SOP data...");
        await repo.clear();

        const sops: Partial<Sop>[] = [
            {
                intentCode: "REQUEST_REFUND",
                agentOwner: "orchestrator",
                title: "Cancel an order and process its automatic refund. Use this for any request to cancel, even if a refund is mentioned for the same order.",
                requiredData: [
                    {
                        name: "orderId",
                        type: "string",
                        description: "The order ID.",
                    },
                    {
                        name: "issueCategory",
                        type: "string",
                        description:
                            "Categorize the problem: 'missing_item', 'wrong_item', 'quality_issue', or 'late_delivery'. If the user's description matches multiple categories, choose the one that best fits the main issue.",
                        enum: [
                            "missing_item",
                            "wrong_item",
                            "quality_issue",
                            "late_delivery",
                        ],
                    },
                    {
                        name: "description",
                        type: "string",
                        description:
                            "The user's description of the issue in their own words.",
                    },
                    {
                        name: "items",
                        type: "array",
                        description:
                            "An array of objects containing the name and quantity of an affected item. Only require this if the category is missing_item, wrong_item, or quality_issue.",
                        itemsSchema: [
                            {
                                name: "name",
                                type: "string",
                                description: "The name of the affected item.",
                            },
                            {
                                name: "quantity",
                                type: "number",
                                description:
                                    "The quantity of this specific item affected. This must be lower than or equal to the quantity ordered for this item. Only required if the category is missing_item, wrong_item, or quality_issue.",
                            },
                        ],
                    },
                ],
                workflowSteps: [
                    "1. Gather all the required data from the user. Ask clarifying questions if anything is missing.",
                ],
                permittedTools: ["Route_To_Resolution"],
            },
            {
                intentCode: "PROCESS_REFUND_LOGIC",
                agentOwner: "refund_agent",
                title: "Refund Calculation and Execution",
                requiredData: [
                    {
                        name: "orderId",
                        type: "string",
                        description: "The order ID.",
                    },
                    {
                        name: "issueCategory",
                        type: "string",
                        description: "The category of the issue.",
                    },
                    {
                        name: "items",
                        type: "array",
                        description:
                            "Array of items affected. Only required if the category is missing_item or wrong_item.",
                        itemsSchema: [
                            {
                                name: "name",
                                type: "string",
                                description: "Item name",
                            },
                            {
                                name: "quantity",
                                type: "number",
                                description: "Item quantity",
                            },
                        ],
                    },
                ],
                workflowSteps: [
                    "1. First, you MUST get the full order details using the Get_Order_Details tool. Look closely at the 'totalRefundedAmount' and 'totalOrderValue'.",
                    "2. Only allow one refund per orderID",
                    "3. If full refund, delivery fee will also be refund.",
                    "4. if partial refund, will only refund the specific item",
                    "5. Refund status must be none, only can process refund.",
                    "6. REFUND STATUS CHECK: Check the 'refundStatus' field from the order details. If it is anything other than 'NONE', immediately return a rejection string: 'This order has already been refunded and is not eligible for a further refund.' Do not proceed regardless of item or issue category.",
                    "7. Ensure that the status field of the order is 'DELIVERED'. Else, return a rejection string.",
                    "8. Ensure that the updatedAt field of the order is within the past 2 hours.",
                    "9. ITEM CHECK: If the issueCategory is 'missing_item' or 'wrong_item', check the requested quantity against each matched line's remaining eligible quantity (quantityOrdered - quantityRefunded). If requested quantity is greater than remaining eligible quantity, return a rejection string stating the requested quantity exceeds what was ordered/eligible.",
                    "10. Calculate the new refund value. Each line has 'price' = unit price and 'itemValue' = total for that line. For missing/wrong items: refund dollars = (units being refunded) × (unit 'price'); never use 'price' alone as the total when refunding more than one unit. Never use customer-provided prices/amounts from free text (e.g. '$10 each') for calculations; only order data is authoritative. For a full line refund, the amount may equal that line's 'itemValue'. (Late: $5, Quality: 20% of relevant item value, Missing/wrong: quantity × unit price.)",
                    "11. MATH CHECK: Subtract 'totalRefundedAmount' from 'totalOrderValue' to find the maximum allowed refund.",
                    "12. If the new refund value is greater than the maximum allowed refund, return a rejection string: 'This order has already been fully or partially refunded. Remaining eligible amount exceeded.'",
                    "13. Compare the calculated refund total to the $20 auto-approval limit.",
                    "14. If the refund total is STRICTLY GREATER than $20, STOP immediately and return a rejection string such as: 'REJECTED: Refund amount exceeds the $20 auto-approval limit; this request requires manual review.' Do NOT call Route_To_Guardian or Execute_Refund.",
                    "15. If the refund total is $20 or less, call Route_To_Guardian with an accurate summary (orderId, lines, units, total dollars). If Guardian rejects, return the reason. If Guardian approves, execute Execute_Refund with correct orderItemId(s) and unit quantity(ies).",
                    "16. Return a simple success/failure status with the final amount to the Orchestrator.",
                ],
                permittedTools: [
                    "Get_Order_Details",
                    "Execute_Refund",
                    "Route_To_Guardian",
                ],
            },
            {
                intentCode: "CANCEL_ORDER",
                agentOwner: "orchestrator",
                title: "Cancel an order and process its automatic refund. Use this for any request to cancel, even if a refund is mentioned for the same order.",
                requiredData: [
                    {
                        name: "orderId",
                        type: "string",
                        description: "The order ID.",
                    },
                    {
                        name: "description",
                        type: "string",
                        description:
                            "The user's reason for cancellation in their own words.",
                    },
                ],
                workflowSteps: [
                    "1. Gather all the required data from the user. Ask clarifying questions if anything is missing.",
                ],
                permittedTools: ["Route_To_Logistics"],
            },
            {
                intentCode: "PROCESS_CANCELLATION_LOGIC",
                agentOwner: "logistics_agent",
                title: "Order Cancellation Validation and Execution",
                requiredData: [
                    {
                        name: "orderId",
                        type: "string",
                        description: "The order ID.",
                    },
                ],
                workflowSteps: [
                    "1. Execute Get_Order_Details tool to fetch the current state of the order.",
                    "2. Wait for the Get_Order_Details tool's response.",
                    "3. Check the 'status' field. If the status is 'CREATED', the order is eligible for standard cancellation, proceed to step 7.",
                    "4. If the status is 'PREPARATION' or 'IN_DELIVERY', the order cannot normally be cancelled. You MUST calculate the time difference between the 'updatedAt' timestamp and the CURRENT SYSTEM TIME.",
                    "5. If the calculated time difference is MORE than 3 hours, the order is eligible for late-cancellation. Proceed to step 7.",
                    "6. If the calculated time difference is LESS than or EQUAL to 3 hours, STOP immediately and return a rejection string stating the food is out for delivery. DO NOT execute any other tools.",
                    "7. If the status is 'DELIVERED' or 'CANCELLED', the order is not eligible for cancellation. STOP immediately and return a rejection string stating the food has already been delivered/cancelled. DO NOT execute any other tools.",
                    "8. If eligible for cancellation, execute the Route_To_Guardian tool to check the user's cancellation quota and fraud risk.",
                    "9. Wait for the Guardian Agent's response.",
                    "10. If rejected by Guardian, return a rejection string to the Orchestrator stating: 'Rejected by Guardian, requires manual review'.",
                    "11. If approved by Guardian, execute the Execute_Cancellation_And_Refund tool.",
                    "12. Return a simple success/failure status explicitly confirming the cancellation and refund, along with the reason, to the Orchestrator.",
                ],
                permittedTools: [
                    "Get_Order_Details",
                    "Route_To_Guardian",
                    "Execute_Cancellation_And_Refund",
                ],
            },
            {
                intentCode: "VERIFICATION",
                agentOwner: "guardian_agent",
                title: "Response Verification Before Customer Delivery",
                requiredData: [],
                workflowSteps: [
                    "1. Read the proposed response carefully.",
                    "2. Check that no refund amount exceeds $20 (auto-approval limit).",
                    "3. Check that no order cancellation is approved if status is DELIVERED or CANCELLED.",
                    "4. Check that the response does not reveal internal tool names, SOP details, or system limits.",
                    "5. Check that the response does not contain hallucinated data (made-up amounts, order IDs, or item names).",
                    "6. If all checks pass, return the proposed response exactly as-is.",
                    "7. If any check fails, return a corrected version prefixed with 'CORRECTED: ' and append the reason in brackets at the end.",
                ],
                permittedTools: [],
            },
        ];

        await repo.insert(sops);
        console.log("Successfully seeded SOP documents!");
    }
}
