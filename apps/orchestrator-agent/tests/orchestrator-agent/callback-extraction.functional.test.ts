import { ChatOpenAI } from "@langchain/openai";
import { PromptShieldService } from "../../src/modules/prompt-shield/prompt-shield.service";
import { createCallbackExtractionNode } from "../../src/orchestrator-agent/nodes/callback-extraction.node";
import dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

async function runTests() {
    console.log("--- STARTING CALLBACK EXTRACTION FUNCTIONAL TESTS ---\n");
    const llm = new ChatOpenAI({ modelName: "gpt-5.4-mini", temperature: 0 });
    const promptShield = new PromptShieldService();
    const node = createCallbackExtractionNode({
        llm,
        llmFallback: llm,
        promptShield,
    });

    const testCases = [
        {
            name: "Approved Request",
            state: {
                agent_message:
                    "Status: Approved. OrderId: 12345. Amount: $15.00. The refund has been processed successfully.",
                redacted_message:
                    "Status: Approved. OrderId: 12345. Amount: $15.00. The refund has been processed successfully.",
                is_safe: true,
                summary: "User requested a refund for order 12345.",
            },
            validate: (res: any) =>
                res.synthesized_message.toLowerCase().includes("approved") &&
                res.synthesized_message.includes("12345") &&
                res.synthesized_message.includes("15.00"),
        },
        {
            name: "Rejected Request",
            state: {
                agent_message:
                    "Status: Rejected. OrderId: 67890. Reason: Policy violation. The user has requested too many refunds recently.",
                redacted_message:
                    "Status: Rejected. OrderId: 67890. Reason: Policy violation. The user has requested too many refunds recently.",
                is_safe: true,
                summary: "User requested a refund for order 67890.",
            },
            validate: (res: any) =>
                res.synthesized_message.toLowerCase().includes("rejected") &&
                res.synthesized_message.includes("67890") &&
                res.synthesized_message.toLowerCase().includes("support"),
        },
        {
            name: "Fallback: Unsafe Rejected",
            state: {
                agent_message: "Status: Rejected. Reason: Fraud.",
                redacted_message: "Status: Rejected. Reason: Fraud.",
                is_safe: false,
                summary: "",
            },
            validate: (res: any) =>
                res.synthesized_message ===
                "Your request has been rejected. Please request human support for more information regarding this decision.",
        },
        {
            name: "Fallback: Unsafe Approved",
            state: {
                agent_message: "Status: Approved. Amount: $10.",
                redacted_message: "Status: Approved. Amount: $10.",
                is_safe: false,
                summary: "",
            },
            validate: (res: any) =>
                res.synthesized_message ===
                "Your request has been approved. Please check your order details for the most current information.",
        },
        {
            name: "Fallback: Unsafe Unknown",
            state: {
                agent_message: "The status has been updated.",
                redacted_message: "The status has been updated.",
                is_safe: false,
                summary: "",
            },
            validate: (res: any) =>
                res.synthesized_message ===
                "Your request has been updated. Please check your order details for the most current information.",
        },
    ];

    let passed = 0;
    for (const test of testCases) {
        process.stdout.write(`Testing: ${test.name.padEnd(30)} `);
        try {
            const result = await node(test.state as any);
            if (test.validate(result)) {
                console.log("✅ PASSED");
                passed++;
            } else {
                console.log("❌ FAILED");
                console.log("   Result:", result.synthesized_message);
            }
        } catch (e) {
            console.log("💥 ERROR:", e);
        }
    }
    console.log(
        `\n--- TESTS COMPLETED: ${passed}/${testCases.length} PASSED ---`,
    );
}

runTests();
