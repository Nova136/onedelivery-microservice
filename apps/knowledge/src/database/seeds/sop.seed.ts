import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Sop } from "../entities/sop.entity";
import { OpenAIEmbeddings } from "@langchain/openai";

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
                title: "Order Cancellation Workflow",
                content:
                    'Trigger: User wants to cancel an active order. \nStep 1: Do NOT ask for confirmation yet. Use Route_To_Logistics with action "check_cancellation_viability" passing the order ID. \nStep 2: If Logistics says the order is too far along (e.g., already picked up), apologize and deny the cancellation. \nStep 3: If Logistics says it IS viable, ask the user for explicit confirmation (e.g., "I can cancel this for you right now. Are you sure?"). \nStep 4: Once confirmed, use Route_To_Logistics with action "execute_cancellation" and userConfirmed: true. \nStep 5: Inform the user the order is cancelled.',
                embedding: await new OpenAIEmbeddings().embedQuery(
                    "Order Cancellation Workflow",
                ),
            },
            {
                title: "Missing or Damaged Item Resolution",
                content: `Trigger: User reports missing items, wrong items, or ruined food. 
                Step 1: Apologize for the frustrating experience. 
                Step 2: Ask the user to specify EXACTLY which items are missing or damaged. Do not guess. 
                Step 3: If damaged or completely wrong, ask for a photo. (Skip if just missing). 
                Step 4: Use Route_To_Refund with action "report_missing" or "report_damage", passing the array of specific items. 
                Step 5: If the Resolution Agent approves a refund, tell the user the exact amount credited. NEVER reveal internal limits to the user.`,
                embedding: await new OpenAIEmbeddings().embedQuery(
                    "Missing or Damaged Item Resolution",
                ),
            },
            {
                title: "Order Tracking and ETA Updates",
                content: `Trigger: User is asking for the status, location, or ETA of their active order. 
                Step 1: Use Route_To_Logistics with action "track_order" and the order ID. 
                Step 2: Read the response. If "preparing", tell the user the kitchen is working on it and provide the ETA. 
                Step 3: If "on_the_way", tell the user the driver is en route and provide the ETA. 
                Step 4: If logistics reports a severe delay, apologize proactively and let them know we are monitoring the situation.`,
                embedding: await new OpenAIEmbeddings().embedQuery(
                    "Order Tracking and ETA Updates",
                ),
            },
            {
                title: "High-Severity Escalations and Safety",
                content: `Trigger: User is highly abusive, threatening legal action, reporting food poisoning/allergies, or reporting a safety issue with a driver. 
                Step 1: Do NOT attempt to solve the problem, argue, or offer refunds. 
                Step 2: Immediately use the Escalate_To_Human tool, passing a brief summary of the threat or safety issue. 
                Step 3: Reply to the user with a highly empathetic, professional message stating their ticket has been escalated to a specialized Trust & Safety manager who will contact them immediately. 
                Step 4: End the automated conversation flow.`,
                embedding: await new OpenAIEmbeddings().embedQuery(
                    "High-Severity Escalations and Safety",
                ),
            },
            {
                title: "Guardian Agent Refund Approval Limits",
                content: `Trigger: Resolution Agent is calculating compensation. 
                Rule 1: Any refund under $15.00 can be processed automatically without Guardian approval.`,
                embedding: await new OpenAIEmbeddings().embedQuery(
                    "Guardian Agent Refund Approval Limits",
                ),
            },
        ];

        await repo.insert(sops);
        console.log("Successfully seeded SOP documents!");
    }
}
