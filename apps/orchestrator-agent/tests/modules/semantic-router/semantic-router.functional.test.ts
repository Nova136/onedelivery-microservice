import { SemanticRouterService } from "../../../src/modules/semantic-router/semantic-router.service";
import dotenv from "dotenv";

dotenv.config();

async function runTests() {
    const router = new SemanticRouterService();

    const testCases = [
        {
            name: "General: Out-of-Scope (Medical)",
            input: "How do I treat a fever?",
            expectedCategories: ["general"],
        },
        {
            name: "General: Out-of-Scope (Financial)",
            input: "What stock should I buy?",
            expectedCategories: ["general"],
        },
        {
            name: "General: Out-of-Scope (Competitor)",
            input: "What is the cancellation policy for Grab?",
            expectedCategories: ["general"],
        },
        {
            name: "General: Out-of-Scope (News)",
            input: "Who is winning the war?",
            expectedCategories: ["general"],
        },
        {
            name: "Logistics: Tracking Query",
            input: "Where is my OneDelivery order #FOOD-12345?",
            expectedCategories: ["logistics"],
        },
        {
            name: "Logistics: Delivery Delay",
            input: "My delivery is late, what's happening?",
            expectedCategories: ["logistics"],
        },
        {
            name: "Resolution: Cold Food",
            input: "My burger arrived cold and soggy.",
            expectedCategories: ["resolution"],
        },
        {
            name: "Resolution: Refund Request",
            input: "I want a refund for my missing fries.",
            expectedCategories: ["resolution"],
        },
        {
            name: "FAQ: Delivery Zones",
            input: "Do you deliver to the downtown area?",
            expectedCategories: ["faq"],
        },
        {
            name: "FAQ: Payment Methods",
            input: "What payment methods do you accept?",
            expectedCategories: ["faq"],
        },
        {
            name: "Escalate: Human Agent",
            input: "I want to talk to a real person.",
            expectedCategories: ["escalate"],
        },
        {
            name: "Escalate: Legal Threat",
            input: "I'm going to sue you for this!",
            expectedCategories: ["escalate"],
        },
        {
            name: "End Session: Goodbye",
            input: "Thanks for your help, goodbye!",
            expectedCategories: ["end_session"],
        },
        {
            name: "General: Greeting",
            input: "Hello there!",
            expectedCategories: ["general"],
        },
        {
            name: "Mixed: Delay and Frustration",
            input: "My order is late and I'm very angry, I want to talk to someone!",
            expectedCategories: ["escalate"],
        },
        {
            name: "Multi-Intent: General and FAQ",
            input: "what is yesterday's toto wining number? Who is the winner of the world cup? What is your cancellation policies",
            expectedCategories: ["general", "faq"],
        },
    ];

    console.log("--- STARTING SEMANTIC ROUTER FUNCTIONAL TESTS ---\n");

    let passed = 0;
    for (const test of testCases) {
        process.stdout.write(`Testing: ${test.name.padEnd(35)} `);
        try {
            const messages = [{ role: "user", content: test.input }];
            const { categories } = await router.classifyCategory(
                messages,
                "",
                [],
            );

            const isMatch = test.expectedCategories.every((cat) =>
                categories.includes(cat),
            );

            if (isMatch) {
                console.log("✅ PASSED");
                passed++;
            } else {
                console.log(
                    `❌ FAILED (Expected ${test.expectedCategories.join(", ")}, got ${categories.join(", ")})`,
                );
            }
        } catch (error) {
            console.log(`💥 ERROR: ${error}`);
        }
    }

    console.log(
        `\n--- TESTS COMPLETED: ${passed}/${testCases.length} PASSED ---`,
    );
}

runTests();
