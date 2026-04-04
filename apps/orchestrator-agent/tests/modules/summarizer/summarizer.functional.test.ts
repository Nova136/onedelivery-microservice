import { SummarizerService } from "../../../src/modules/summarizer/summarizer.service";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import dotenv from "dotenv";

dotenv.config();

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "mock-key";
process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "mock-key";

async function runTests() {
    console.log("--- STARTING SUMMARIZER FUNCTIONAL TESTS ---\n");
    const summarizer = new SummarizerService();

    const testCases = [
        {
            name: "Initial Summary",
            existingSummary: "",
            currentTask: "refund_request",
            messages: [
                new HumanMessage("I want a refund for order 12345 because the item was defective."),
                new AIMessage("I can help with that. I have submitted your request.")
            ],
            validate: (res: string) => {
                const lowerRes = res.toLowerCase();
                return lowerRes.includes("12345") || lowerRes.includes("refund") || lowerRes.includes("defective");
            }
        },
        {
            name: "Update Existing Summary",
            existingSummary: "Current Goal: Refund request for order 12345.\nKey Facts: Order 12345.\nStatus: Pending reason.",
            currentTask: "refund_request",
            messages: [
                new HumanMessage("The item was damaged when it arrived."),
                new AIMessage("I'm sorry to hear that. I have submitted your refund request for order 12345 due to damage.")
            ],
            validate: (res: string) => res.toLowerCase().includes("damage") && res.toLowerCase().includes("submit")
        },
        {
            name: "Task Transition to None",
            existingSummary: "Current Goal: Refund request for order 12345.\nKey Facts: Order 12345, damaged.\nStatus: Submitted.",
            currentTask: "None",
            messages: [
                new HumanMessage("Thanks, that's all."),
                new AIMessage("You're welcome! Have a great day.")
            ],
            validate: (res: string) => {
                const lowerRes = res.toLowerCase();
                return lowerRes.includes("resolved") || lowerRes.includes("completed") || lowerRes.includes("submitted");
            }
        }
    ];

    let passed = 0;
    for (const test of testCases) {
        process.stdout.write(`Testing: ${test.name.padEnd(30)} `);
        try {
            const result = await summarizer.summarize(test.messages, test.existingSummary, test.currentTask);
            console.log(`\n   Result: ${result}`);
            if (test.validate(result)) {
                console.log("✅ PASSED");
                passed++;
            } else {
                console.log("❌ FAILED");
                console.log("   Result:", result);
            }
        } catch (e) {
            console.log("💥 ERROR:", e);
        }
    }
    console.log(`\n--- TESTS COMPLETED: ${passed}/${testCases.length} PASSED ---`);
}

runTests();
