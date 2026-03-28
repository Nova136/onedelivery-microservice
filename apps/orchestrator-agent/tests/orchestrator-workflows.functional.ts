import { SemanticRouterService } from "../src/modules/semantic-router/semantic-router.service";
import { createFaqHandlerNode } from "../src/orchestrator-agent/nodes/faq-handler.node";
import { createGeneralHandlerNode } from "../src/orchestrator-agent/nodes/general-handler.node";
import { createEndSessionNode } from "../src/orchestrator-agent/nodes/end-session.node";
import { createEscalationNode } from "../src/orchestrator-agent/nodes/escalation.node";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

async function runTests() {
    const lightModel = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0,
    });

    const router = new SemanticRouterService();

    // Mock FAQ Tool
    class MockFaqTool extends StructuredTool {
        name = "Search_FAQ";
        description = "Search the OneDelivery FAQ database.";
        schema = z.object({ query: z.string() });
        async _call(input: { query: string }) {
            if (input.query.toLowerCase().includes("fee")) {
                return "OneDelivery charges a flat fee of $5.99 for all deliveries within the city limits.";
            }
            return "No specific FAQ found for this query.";
        }
    }
    const tools = [new MockFaqTool()];

    const faqNode = createFaqHandlerNode({ lightModel, tools });
    const generalNode = createGeneralHandlerNode({ lightModel, tools });
    const endSessionNode = createEndSessionNode(tools);
    const escalationNode = createEscalationNode();

    const testCases = [
        {
            name: "Workflow: FAQ (Delivery Fee)",
            input: "What is your delivery fee?",
            expectedCategory: "faq",
            testNode: faqNode,
            validateResponse: (res: string) => res.includes("$5.99"),
        },
        {
            name: "Workflow: General (Medical advice rejection)",
            input: "How do I treat a fever?",
            expectedCategory: "general",
            testNode: generalNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("sorry") ||
                res.toLowerCase().includes("can't") ||
                res.toLowerCase().includes("medical"),
        },
        {
            name: "Workflow: General (Competitor rejection)",
            input: "Is Grab better than OneDelivery?",
            expectedCategory: "general",
            testNode: generalNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("sorry") ||
                res.toLowerCase().includes("onedelivery"),
        },
        {
            name: "Workflow: End Session",
            input: "Thanks, goodbye!",
            expectedCategory: "end_session",
            testNode: endSessionNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("onedelivery") ||
                res.toLowerCase().includes("closed") ||
                res.toLowerCase().includes("assistance"),
        },
        {
            name: "Workflow: Escalate (Legal Threat)",
            input: "I'm going to sue you!",
            expectedCategory: "escalate",
            testNode: escalationNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("escalat") ||
                res.toLowerCase().includes("human") ||
                res.toLowerCase().includes("support"),
        },
    ];

    console.log("--- STARTING ORCHESTRATOR WORKFLOW FUNCTIONAL TESTS ---\n");

    let passed = 0;
    for (const test of testCases) {
        process.stdout.write(`Testing: ${test.name.padEnd(45)} `);
        try {
            const messages = [new HumanMessage(test.input)];

            // 1. Test Routing
            const { categories, decomposed } = await router.classifyCategory(
                [{ role: "user", content: test.input }],
                "",
                [],
            );
            if (!categories.includes(test.expectedCategory)) {
                console.log(
                    `❌ FAILED (Routing: Expected ${test.expectedCategory}, got ${categories.join(", ")})`,
                );
                continue;
            }

            // 2. Test Node Handler
            const state: any = {
                messages,
                user_id: "test-user",
                session_id: "test-session",
                user_orders: [],
                summary: "",
                current_category: test.expectedCategory,
                decomposed_intents: decomposed,
                layers: [],
            };

            const result = await test.testNode(state);
            const response = result.messages[0].content as string;

            if (test.validateResponse(response)) {
                console.log("✅ PASSED");
                passed++;
            } else {
                console.log(`❌ FAILED (Response validation failed)`);
                console.log(`   Response: ${response}`);
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
