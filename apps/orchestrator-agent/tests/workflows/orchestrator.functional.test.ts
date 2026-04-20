import "dotenv/config";
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
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";

// Load .env from the monorepo root
require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env") });

const DATASET_NAME = "Orchestrator-Workflow-Functional-Tests";

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
        inputs: { input: "What is your delivery fee?" },
        outputs: {
            expectedIntent: "faq",
            rule: "INCLUDES",
            keywords: ["$5.99"],
        },
        metadata: { category: "Workflow", description: "FAQ (Delivery Fee)" },
    },
    {
        inputs: { input: "How do I treat a fever?" },
        outputs: {
            expectedIntent: "general",
            rule: "INCLUDES_ANY",
            keywords: ["sorry", "can't", "medical"],
        },
        metadata: {
            category: "Workflow",
            description: "General (Medical advice rejection)",
        },
    },
    {
        inputs: { input: "Is Grab better than OneDelivery?" },
        outputs: {
            expectedIntent: "general",
            rule: "INCLUDES_ANY",
            keywords: ["sorry", "onedelivery"],
        },
        metadata: {
            category: "Workflow",
            description: "General (Competitor rejection)",
        },
    },
    {
        inputs: { input: "Thanks, goodbye!" },
        outputs: {
            expectedIntent: "end_session",
            rule: "INCLUDES_ANY",
            keywords: ["onedelivery", "closed", "assistance"],
        },
        metadata: { category: "Workflow", description: "End Session" },
    },
    {
        inputs: { input: "I'm going to sue you!" },
        outputs: {
            expectedIntent: "escalate",
            rule: "INCLUDES_ANY",
            keywords: ["escalate", "human", "support"],
        },
        metadata: {
            category: "Workflow",
            description: "Escalate (Legal Threat)",
        },
    },
    {
        inputs: {
            input: "What is your delivery fee? Also, how do I treat a fever?",
        },
        outputs: {
            expectedIntent: "faq",
            rule: "INCLUDES",
            keywords: ["$5.99"],
        },
        metadata: {
            category: "Workflow",
            description: "Multi-Intent (FAQ + General)",
        },
    },
    {
        inputs: { input: "Actually, never mind. Reset everything." },
        outputs: {
            expectedIntent: "reset",
            rule: "INCLUDES_ANY",
            keywords: ["reset", "cancel", "cleared"],
        },
        metadata: { category: "Workflow", description: "Reset" },
    },
];

async function target(inputs: { input: string }) {
    const messages = [new HumanMessage(inputs.input)];
    const { intents, decomposed } = await router.classifyIntents(
        [{ role: "user", content: inputs.input }],
        "",
        [],
    );

    const actualIntent = intents[0] || "unknown";

    let testNode;
    if (actualIntent === "faq" || actualIntent === "general")
        testNode = informationalNode;
    else if (actualIntent === "end_session") testNode = endSessionNode;
    else if (actualIntent === "escalate") testNode = escalationNode;
    else if (actualIntent === "reset") testNode = resetNode;
    else testNode = informationalNode; // Fallback to info handler for unknown tests

    const state: any = {
        messages,
        user_id: "test-user",
        session_id: "test-session",
        user_orders: [],
        summary: "",
        current_intent: actualIntent,
        decomposed_intents: decomposed,
        current_intent_index: 0,
    };

    const result: any = await testNode(state);
    const response = result.partial_responses
        ? result.partial_responses[0]
        : result.messages
          ? result.messages[0].content
          : "";

    return { intents, response };
}

const workflowEvaluator = async ({ run, example }: any) => {
    const actualIntents = run.outputs?.intents || [];
    const response = (run.outputs?.response || "").toLowerCase();
    const { expectedIntent, rule, keywords } = example.outputs;

    let passed = true;
    let comment = "Passed.";

    if (!actualIntents.includes(expectedIntent)) {
        passed = false;
        comment = `Routing failed: Expected ${expectedIntent}, got ${actualIntents.join(", ")}. `;
    } else {
        if (rule === "INCLUDES") {
            const hasAll = keywords.every((k: string) =>
                response.includes(k.toLowerCase()),
            );
            if (!hasAll) {
                passed = false;
                comment = `Response validation failed: Missing required keywords. Got: ${run.outputs?.response}`;
            }
        } else if (rule === "INCLUDES_ANY") {
            const hasAny = keywords.some((k: string) =>
                response.includes(k.toLowerCase()),
            );
            if (!hasAny) {
                passed = false;
                comment = `Response validation failed: Missing any expected keywords. Got: ${run.outputs?.response}`;
            }
        }
    }

    return {
        key: "workflow_functional_accuracy",
        score: passed ? 1 : 0,
        comment,
    };
};

async function main() {
    const client = new Client();
    console.log(`Syncing LangSmith dataset: ${DATASET_NAME}...`);

    try {
        await client.readDataset({ datasetName: DATASET_NAME });
        console.log("Dataset already exists. Skipping creation.");
    } catch {
        const dataset = await client.createDataset(DATASET_NAME, {
            description:
                "Functional tests evaluating the Orchestrator workflow logic and routing to sub-nodes.",
        });
        await Promise.all(
            testCases.map((tc) =>
                client.createExample(tc.inputs, tc.outputs, {
                    datasetId: dataset.id,
                    metadata: tc.metadata,
                }),
            ),
        );
        console.log("Dataset populated successfully.");
    }

    console.log("Running evaluation...");
    await evaluate(target, {
        data: DATASET_NAME,
        evaluators: [workflowEvaluator],
        experimentPrefix: "orchestrator-functional",
        client,
    });
    console.log("Evaluation complete! Check your LangSmith dashboard.");
}

main().catch(console.error);
