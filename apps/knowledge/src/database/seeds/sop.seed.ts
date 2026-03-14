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
                title: "Missing or Incorrect Item Intake",
                requiredData: [
                    "orderId",
                    "issueCategory (missing_item, quality_issue, wrong_item, late_delivery, other)",
                    "description",
                    "items (array of objects with item name and quantity)",
                ],
                workflowSteps: [
                    "1. Ensure you have gathered all the required data from the user. Ask clarifying questions if anything is missing.",
                    "2. Empathize with the user and apologize for the mistake with their food.",
                    "3. Execute the Route_To_Resolution tool, passing the gathered data.",
                    "4. Wait for the tool to return a success or rejection string.",
                    "5. If successful, confirm the specific refund amount with the user so they know what to expect.",
                    "6. If rejected, politely explain that the request requires a manual review and ask if they'd like to be transferred to human support.",
                    "7. NEVER mention internal limits, the Guardian Agent, or the technical name of the tool.",
                ],
                permittedTools: ["Route_To_Resolution", "Escalate_To_Human"],
            },
            {
                intentCode: "PROCESS_REFUND_LOGIC",
                agentOwner: "refund_agent",
                title: "Refund Calculation and Execution",
                requiredData: ["orderId", "specificItems", "issueCategory"],
                workflowSteps: [
                    "1. First, you MUST get the full order details using the Get_Order_Details tool. Ensure that the order has been delivered. The delivered timing must be within the past 2 hours. If it is not delivered or has lapsed for more than 2 hours, reject the refund immediately.",
                    "2. Calculate the total refund value based on the specific items.",
                    "3. Check the total value against the $20 auto-approval limit.",
                    "4. If the refund is > $20, DO NOT execute the refund. Route the payload to the Guardian Agent for fraud/quota approval.",
                    "5. If the refund is <= $20 (or Guardian approves), execute the payment gateway refund tool.",
                    "6. Return a simple success/failure string with the final amount back to the Orchestrator.",
                ],
                permittedTools: [
                    "Get_Order_Details",
                    "executeRefund",
                    "Route_To_Guardian",
                ],
            },
        ];

        await repo.insert(sops);
        console.log("Successfully seeded SOP documents!");
    }
}
