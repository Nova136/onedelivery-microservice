import { HumanMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import * as path from "path";
import { IntentClassifierService } from "../../src/modules/intent-classifier/intent-classifier.service";
import { PromptShieldService } from "../../src/modules/prompt-shield/prompt-shield.service";
import { createEndSessionNode } from "../../src/orchestrator-agent/nodes/end-session.node";
import { createEscalationNode } from "../../src/orchestrator-agent/nodes/escalation.node";
import { createInformationalHandlerNode } from "../../src/orchestrator-agent/nodes/informational-handler.node";
import { createResetHandlerNode } from "../../src/orchestrator-agent/nodes/reset-handler.node";

// Load .env from the monorepo root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
console.log(process.env.OPENAI_API_KEY);

async function runTests() {
    const primaryllm = new ChatOpenAI({
        modelName: "gpt-5.4-mini",
        apiKey: process.env.OPENAI_API_KEY,
        temperature: 0,
    });

    const geminiFallback = new ChatGoogleGenerativeAI({
        model: "gemini-3-flash-preview",
        apiKey: process.env.GEMINI_API_KEY || "mock-key",
    });

    primaryllm.withFallbacks({
        fallbacks: [geminiFallback],
    });

    const mockKnowledgeClient = {
        listOrchestratorSops: async () => [
            { intentCode: "LATE_DELIVERY", title: "Late Delivery" },
            { intentCode: "COLD_FOOD", title: "Cold Food" },
            { intentCode: "REQUEST_REFUND", title: "Request Refund" },
        ],
    };
    const router = new IntentClassifierService(mockKnowledgeClient as any);

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

    const promptShield = new PromptShieldService();
    const informationalNode = createInformationalHandlerNode({
        llm: primaryllm,
        llmFallback: geminiFallback,
        tools,
        promptShield,
    });
    const endSessionNode = createEndSessionNode(tools);
    const escalationNode = createEscalationNode(tools);
    const resetNode = createResetHandlerNode();

    const testCases = [
        {
            name: "Workflow: FAQ (Delivery Fee)",
            input: "What is your delivery fee?",
            expectedIntent: "faq",
            testNode: informationalNode,
            validateResponse: (res: string) => res.includes("$5.99"),
        },
        {
            name: "Workflow: General (Medical advice rejection)",
            input: "How do I treat a fever?",
            expectedIntent: "general",
            testNode: informationalNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("sorry") ||
                res.toLowerCase().includes("can't") ||
                res.toLowerCase().includes("medical"),
        },
        {
            name: "Workflow: General (Competitor rejection)",
            input: "Is Grab better than OneDelivery?",
            expectedIntent: "general",
            testNode: informationalNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("sorry") ||
                res.toLowerCase().includes("onedelivery"),
        },
        {
            name: "Workflow: End Session",
            input: "Thanks, goodbye!",
            expectedIntent: "end_session",
            testNode: endSessionNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("onedelivery") ||
                res.toLowerCase().includes("closed") ||
                res.toLowerCase().includes("assistance"),
        },
        {
            name: "Workflow: Escalate (Legal Threat)",
            input: "I'm going to sue you!",
            expectedIntent: "escalate",
            testNode: escalationNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("escalate") ||
                res.toLowerCase().includes("human") ||
                res.toLowerCase().includes("support"),
        },
        {
            name: "Workflow: Multi-Intent (FAQ + General)",
            input: "What is your delivery fee? Also, how do I treat a fever?",
            expectedIntent: "faq",
            testNode: informationalNode, // Test FAQ first
            validateResponse: (res: string) => res.includes("$5.99"),
        },
        {
            name: "Workflow: Reset",
            input: "Actually, never mind. Reset everything.",
            expectedIntent: "reset",
            testNode: resetNode,
            validateResponse: (res: string) =>
                res.toLowerCase().includes("reset") ||
                res.toLowerCase().includes("cancel") ||
                res.toLowerCase().includes("cleared"),
        },
    ];

    console.log("--- STARTING ORCHESTRATOR WORKFLOW FUNCTIONAL TESTS ---\n");

    let passed = 0;
    for (const test of testCases) {
        process.stdout.write(`Testing: ${test.name.padEnd(45)} `);
        try {
            const messages = [new HumanMessage(test.input)];

            // 1. Test Routing
            const { intents, decomposed } = await router.classifyIntents(
                [{ role: "user", content: test.input }],
                "",
                [],
            );
            if (!intents.includes(test.expectedIntent)) {
                console.log(
                    `❌ FAILED (Routing: Expected ${test.expectedIntent}, got ${intents.join(", ")})`,
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
                current_intent: test.expectedIntent,
                decomposed_intents: decomposed,
                current_intent_index: 0,
            };

            const result: any = await test.testNode(state);
            const response = result.partial_responses
                ? result.partial_responses[0]
                : result.messages
                  ? result.messages[0].content
                  : "";

            if (test.validateResponse(response as string)) {
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
