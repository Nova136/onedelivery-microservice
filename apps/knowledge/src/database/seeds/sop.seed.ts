import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Sop } from "../entities/sop.entity";

export default class SopSeeder implements Seeder {
    public async run(dataSource: DataSource): Promise<void> {
        const repo = dataSource.getRepository(Sop);

        // Avoid duplicating seed data if it already exists
        const existing = await repo.count();
        if (existing > 0) {
            console.log("Internal SOP data already seeded. Skipping...");
            return;
        }

        const sops: Partial<Sop>[] = [
            {
                intentCode: "REQUEST_REFUND",
                agentOwner: "orchestrator",
                title: "Request Refund from Customer",
                requiredData: [
                    "orderId",
                    "issueCategory (missing_item, quality_issue, wrong_item, late_delivery)",
                    "description",
                    "items (array of objects with item name and quantity. NOTE: Only require this if the category is missing_item or wrong_item. If late_delivery or quality_issue, skip this.)",
                ],
                workflowSteps: [
                    "1. Ensure you have gathered all the required data from the user. Ask clarifying questions if anything is missing.",
                    "2. Empathize with the user and apologize for the mistake with their food.",
                    "3. Execute the Route_To_Resolution tool, passing the gathered data.",
                    "4. Wait for the tool to return a success or rejection string.",
                    "5. If successful, confirm the specific refund amount with the user so they know what to expect.",
                    "6. If rejected, politely explain that the request requires a manual review and ask if they'd like to be transferred to human support.",
                    "7. If the user agrees to be transferred, execute the Escalate_To_Human tool.",
                ],
                permittedTools: ["Route_To_Resolution", "Escalate_To_Human"],
            },
            {
                intentCode: "PROCESS_REFUND_LOGIC",
                agentOwner: "refund_agent",
                title: "Refund Calculation and Execution",
                requiredData: [
                    "orderId",
                    "issueCategory",
                    "items (array of objects with item name and quantity. NOTE: Only require this if the category is missing_item or wrong_item. If late_delivery or quality_issue, skip this.)",
                ],
                workflowSteps: [
                    "1. First, you MUST get the full order details using the Get_Order_Details tool. Look closely at the 'totalRefundedAmount' and 'totalOrderValue'.",
                    "2. Ensure that the status field of the order is 'DELIVERED'. Else, return a rejection string.",
                    "3. Ensure that the updatedAt field of the order is within the past 2 hours.",
                    "4. ITEM CHECK: If the issueCategory is 'missing_item' or 'wrong_item', check the 'quantityRefunded' for the specificItems. If 'quantityRefunded' is equal to or greater than 'quantityOrdered', return a rejection string: 'This specific item has already been fully refunded.'",
                    "5. Calculate the new refund value. (Late: $5, Quality: 20% of item value, Missing: item value).",
                    "6. MATH CHECK: Subtract 'totalRefundedAmount' from 'totalOrderValue' to find the maximum allowed refund.",
                    "7. If the new refund value is greater than the maximum allowed refund, return a rejection string: 'This order has already been fully or partially refunded. Remaining eligible amount exceeded.'",
                    "8. Check the new calculated total against the $20 auto-approval limit.",
                    "9. If the refund is > $20, return a rejection string: 'Exceeds auto-approval limit, requires human review'.",
                    "10. If the refund is <= $20, execute the Route_To_Guardian tool to check for fraud/quota approval.",
                    "11. If approved by Guardian, execute the Execute_Refund tool.",
                    "12. Return a simple success/failure status with the final amount to the Orchestrator.",
                ],
                permittedTools: [
                    "Get_Order_Details",
                    "Execute_Refund",
                    "Route_To_Guardian",
                ],
            },
        ];

        await repo.insert(sops);
        console.log("Successfully seeded SOP documents!");
    }
}
