import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { PromptShieldService } from "../../src/modules/prompt-shield/prompt-shield.service";
import { createCallbackExtractionNode } from "../../src/orchestrator-agent/nodes/callback-extraction.node";
import * as path from "path";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";

require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env") });

const DATASET_NAME = "Orchestrator-Callback-Extraction-Functional-Tests";

const testCases = [
    {
        inputs: {
            agent_message:
                "Status: Approved. OrderId: 12345. Amount: $15.00. The refund has been processed successfully.",
            redacted_message:
                "Status: Approved. OrderId: 12345. Amount: $15.00. The refund has been processed successfully.",
            is_safe: true,
            summary: "User requested a refund for order 12345.",
        },
        outputs: {
            match_type: "INCLUDES",
            keywords: ["approved", "12345", "15.00"],
        },
        metadata: { category: "Approved Request" },
    },
    {
        inputs: {
            agent_message:
                "Status: Rejected. OrderId: 67890. Reason: Policy violation. The user has requested too many refunds recently.",
            redacted_message:
                "Status: Rejected. OrderId: 67890. Reason: Policy violation. The user has requested too many refunds recently.",
            is_safe: true,
            summary: "User requested a refund for order 67890.",
        },
        outputs: {
            match_type: "INCLUDES",
            keywords: ["rejected", "67890", "support"],
        },
        metadata: { category: "Rejected Request" },
    },
    {
        inputs: {
            agent_message: "Status: Rejected. Reason: Fraud.",
            redacted_message: "Status: Rejected. Reason: Fraud.",
            is_safe: false,
            summary: "",
        },
        outputs: {
            match_type: "EXACT",
            expected:
                "Your request has been rejected. Please request human support for more information regarding this decision.",
        },
        metadata: { category: "Fallback", description: "Unsafe Rejected" },
    },
    {
        inputs: {
            agent_message: "Status: Approved. Amount: $10.",
            redacted_message: "Status: Approved. Amount: $10.",
            is_safe: false,
            summary: "",
        },
        outputs: {
            match_type: "EXACT",
            expected:
                "Your request has been approved. Please check your order details for the most current information.",
        },
        metadata: { category: "Fallback", description: "Unsafe Approved" },
    },
    {
        inputs: {
            agent_message: "The status has been updated.",
            redacted_message: "The status has been updated.",
            is_safe: false,
            summary: "",
        },
        outputs: {
            match_type: "EXACT",
            expected:
                "Your request has been updated. Please check your order details for the most current information.",
        },
        metadata: { category: "Fallback", description: "Unsafe Unknown" },
    },
];

async function target(inputs: any) {
    const llm = new ChatOpenAI({ modelName: "gpt-5.4-mini", temperature: 0 });
    const promptShield = new PromptShieldService();
    const node = createCallbackExtractionNode({
        llm,
        llmFallback: llm,
        promptShield,
    });

    const result = await node(inputs);
    return { synthesized_message: result.synthesized_message };
}

const callbackEvaluator = async ({ run, example }: any) => {
    const prediction = run.outputs?.synthesized_message || "";
    const { match_type, keywords, expected } = example.outputs;

    let passed = false;
    let comment = "";

    if (match_type === "INCLUDES") {
        const lowerPred = prediction.toLowerCase();
        passed = keywords.every((k: string) =>
            lowerPred.includes(k.toLowerCase()),
        );
        comment = passed
            ? "Included all keywords."
            : `Missing keywords. Got: ${prediction}`;
    } else if (match_type === "EXACT") {
        passed = prediction === expected;
        comment = passed
            ? "Exact match."
            : `Expected: "${expected}", Got: "${prediction}"`;
    }

    return {
        key: "callback_extraction_accuracy",
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
                "Functional tests evaluating the Callback Extraction node's ability to synthesize and fallback safely.",
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
        evaluators: [callbackEvaluator],
        experimentPrefix: "callback-extraction-functional",
        client,
    });
    console.log("Evaluation complete! Check your LangSmith dashboard.");
}

main().catch(console.error);
