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
            // 1. The Resolution SOP (Refunds)
            {
                intentCode: "MISSING_FOOD",
                agentOwner: "orchestrator",
                title: "Missing or Incorrect Item Resolution",
                requiredData: ["orderId", "exactNamesOfMissingItems"],
                workflowSteps: [
                    "1. Verify you have the orderId and the specific names of the missing items from the user. Ask clarifying questions if missing.",
                    "2. Apologize empathetically for the missing food and the poor experience.",
                    "3. Call the Route_To_Refund tool passing the orderId and missing items.",
                    "4. Wait for the tool's response. If successful, confirm the refund amount with the user.",
                    "5. If the tool rejects the refund, politely explain that it requires manual review and ask if they'd like to be transferred to support.",
                    "6. NEVER mention internal limits or the tool's name.",
                ],
                permittedTools: ["Route_To_Refund"],
            },

            // 2. The Logistics SOP (Active Cancellations)
            {
                intentCode: "CANCEL_ORDER",
                agentOwner: "orchestrator",
                title: "Cancel Active Order Request",
                requiredData: ["orderId", "reasonForCancellation"],
                workflowSteps: [
                    "1. Confirm you have the orderId and a brief reason for the cancellation.",
                    "2. Warn the user that if the restaurant has already started cooking, they might not be eligible for a full refund.",
                    "3. Call the Route_To_Logistics tool with the action set to 'CANCEL'.",
                    "4. Relay the exact outcome from the tool to the user (e.g., success, partial refund, or too late to cancel).",
                    "5. Do not make up delivery rules; only state what the tool returns.",
                ],
                permittedTools: ["Route_To_Logistics"],
            },

            // 3. The Logistics SOP (Order Tracking)
            {
                intentCode: "TRACK_ORDER",
                agentOwner: "orchestrator",
                title: "Check Order ETA and Status",
                requiredData: ["orderId"],
                workflowSteps: [
                    "1. Ensure you have the orderId.",
                    "2. Call the Route_To_Logistics tool with the action set to 'TRACK'.",
                    "3. Tell the user the current status (e.g., At Restaurant, On the Way) and the estimated time of arrival (ETA).",
                    "4. If the order is delayed, apologize for the wait and offer a friendly reassurance.",
                ],
                permittedTools: ["Route_To_Logistics"],
            },

            // 4. The Guardian SOP (Safety & Escalations)
            {
                intentCode: "ESCALATE_SAFETY",
                agentOwner: "orchestrator",
                title: "Handle Severe Safety or Abuse Escalations",
                requiredData: ["orderId", "incidentDescription"],
                workflowSteps: [
                    "1. Read the incident description to confirm it involves food poisoning, physical safety, severe allergies, or extreme driver misconduct.",
                    "2. IMMEDIATELY apologize and validate the user's concern. Treat this with maximum seriousness and empathy.",
                    "3. DO NOT attempt to issue a refund yourself. DO NOT promise a specific resolution.",
                    "4. Call the Escalate_To_Human tool, passing the incident details and orderId.",
                    "5. Inform the user that their safety is our top priority and a specialized support manager will review this and contact them shortly.",
                ],
                permittedTools: ["Escalate_To_Human"],
            },
        ];

        await repo.insert(sops);
        console.log("Successfully seeded SOP documents!");
    }
}
