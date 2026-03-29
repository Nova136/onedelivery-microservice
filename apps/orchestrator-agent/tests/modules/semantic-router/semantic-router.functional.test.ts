import { SemanticRouterService } from "../../../src/modules/semantic-router/semantic-router.service";
import { KnowledgeClientService } from "../../../src/modules/clients/knowledge-client/knowledge-client.service";
import dotenv from "dotenv";

dotenv.config();

async function runTests() {
    const knowledgeClient = new KnowledgeClientService(null);
    const router = new SemanticRouterService(knowledgeClient);

    const testCases = [
        {
            name: "General: Out-of-Scope (Medical)",
            input: "How do I treat a fever?",
            expectedIntents: ["general"]
        },
        {
            name: "General: Out-of-Scope (Financial)",
            input: "What stock should I buy?",
            expectedIntents: ["general"]
        },
        {
            name: "General: Out-of-Scope (Competitor)",
            input: "What is the cancellation policy for Grab?",
            expectedIntents: ["general"]
        },
        {
            name: "General: Out-of-Scope (News)",
            input: "Who is winning the war?",
            expectedIntents: ["general"]
        },
        {
            name: "Logistics: Tracking Query",
            input: "Where is my OneDelivery order #FOOD-12345?",
            expectedIntents: ["LATE_DELIVERY"]
        },
        {
            name: "Logistics: Delivery Delay",
            input: "My delivery is late, what's happening?",
            expectedIntents: ["LATE_DELIVERY"]
        },
        {
            name: "Resolution: Cold Food",
            input: "My burger arrived cold and soggy.",
            expectedIntents: ["COLD_FOOD"]
        },
        {
            name: "Resolution: Refund Request",
            input: "I want a refund for my missing fries.",
            expectedIntents: ["REQUEST_REFUND"]
        },
        {
            name: "FAQ: Delivery Zones",
            input: "Do you deliver to the downtown area?",
            expectedIntents: ["faq"]
        },
        {
            name: "FAQ: Payment Methods",
            input: "What payment methods do you accept?",
            expectedIntents: ["faq"]
        },
        {
            name: "Escalate: Human Agent",
            input: "I want to talk to a real person.",
            expectedIntents: ["escalate"]
        },
        {
            name: "Escalate: Legal Threat",
            input: "I'm going to sue you for this!",
            expectedIntents: ["escalate"]
        },
        {
            name: "End Session: Goodbye",
            input: "Thanks for your help, goodbye!",
            expectedIntents: ["end_session"]
        },
        {
            name: "General: Greeting",
            input: "Hello there!",
            expectedIntents: ["general"]
        },
        {
            name: "Mixed: Delay and Frustration",
            input: "My order is late and I'm very angry, I want to talk to someone!",
            expectedIntents: ["escalate"]
        },
        {
            name: "Multi-Intent: General and FAQ",
            input: "what is yesterday's toto wining number? Who is the winner of the world cup? What is your cancellation policies",
            expectedIntents: ["general", "faq"]
        }
    ];

    console.log("--- STARTING SEMANTIC ROUTER FUNCTIONAL TESTS ---\n");

    let passed = 0;
    for (const test of testCases) {
        process.stdout.write(`Testing: ${test.name.padEnd(35)} `);
        try {
            const messages = [{ role: "user", content: test.input }];
            const { intents } = await router.classifyIntents(messages, "", []);
            
            const isMatch = test.expectedIntents.every(cat => intents.includes(cat));
            
            if (isMatch) {
                console.log("✅ PASSED");
                passed++;
            } else {
                console.log(`❌ FAILED (Expected ${test.expectedIntents.join(", ")}, got ${intents.join(", ")})`);
            }
        } catch (error) {
            console.log(`💥 ERROR: ${error}`);
        }
    }

    console.log(`\n--- TESTS COMPLETED: ${passed}/${testCases.length} PASSED ---`);
}

runTests();
