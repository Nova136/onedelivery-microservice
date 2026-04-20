import "dotenv/config";
import { SummarizerService } from "../../../src/modules/summarizer/summarizer.service";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import * as path from "path";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";

require("dotenv").config({
    path: path.resolve(__dirname, "../../../../../.env"),
});

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "mock-key";
process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "mock-key";

const DATASET_NAME = "Orchestrator-Summarizer-Functional-Tests";
const summarizer = new SummarizerService();

const testCases = [
    {
        inputs: {
            existingSummary: "",
            currentTask: "refund_request",
            messages: [
                {
                    role: "human",
                    content:
                        "I want a refund for order 12345 because the item was defective.",
                },
                {
                    role: "ai",
                    content:
                        "I can help with that. I have submitted your request.",
                },
            ],
        },
        outputs: {
            match_type: "ANY",
            keywords: ["12345", "refund", "defective"],
        },
        metadata: { category: "Initial Summary" },
    },
    {
        inputs: {
            existingSummary:
                "Current Goal: Refund request for order 12345.\nKey Facts: Order 12345.\nStatus: Pending reason.",
            currentTask: "refund_request",
            messages: [
                {
                    role: "human",
                    content: "The item was damaged when it arrived.",
                },
                {
                    role: "ai",
                    content:
                        "I'm sorry to hear that. I have submitted your refund request for order 12345 due to damage.",
                },
            ],
        },
        outputs: { match_type: "ALL", keywords: ["damage", "submit"] },
        metadata: { category: "Update Existing Summary" },
    },
    {
        inputs: {
            existingSummary:
                "Current Goal: Refund request for order 12345.\nKey Facts: Order 12345, damaged.\nStatus: Submitted.",
            currentTask: "None",
            messages: [
                { role: "human", content: "Thanks, that's all." },
                { role: "ai", content: "You're welcome! Have a great day." },
            ],
        },
        outputs: {
            match_type: "ANY",
            keywords: ["resolved", "completed", "submitted"],
        },
        metadata: { category: "Task Transition to None" },
    },
];

async function target(inputs: {
    existingSummary: string;
    currentTask: string;
    messages: { role: string; content: string }[];
}) {
    const lcMessages = inputs.messages.map((m) =>
        m.role === "human"
            ? new HumanMessage(m.content)
            : new AIMessage(m.content),
    );
    const summary = await summarizer.summarize(
        lcMessages,
        inputs.existingSummary,
        inputs.currentTask,
    );
    return { summary };
}

const summarizerEvaluator = async ({ run, example }: any) => {
    const prediction = run.outputs?.summary?.toLowerCase() || "";
    const { match_type, keywords } = example.outputs;

    let passed = false;
    if (match_type === "ANY") {
        passed = keywords.some((k: string) =>
            prediction.includes(k.toLowerCase()),
        );
    } else if (match_type === "ALL") {
        passed = keywords.every((k: string) =>
            prediction.includes(k.toLowerCase()),
        );
    }

    return {
        key: "summarizer_keyword_match",
        score: passed ? 1 : 0,
        comment: passed
            ? `Matched ${match_type} keywords.`
            : `Failed to match ${match_type} keywords: ${keywords.join(", ")}. Got: ${run.outputs?.summary}`,
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
                "Functional tests evaluating the Summarizer Agent's ability to extract key facts and update states.",
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
        evaluators: [summarizerEvaluator],
        experimentPrefix: "summarizer-functional",
        client,
    });
    console.log("Evaluation complete! Check your LangSmith dashboard.");
}

main().catch(console.error);
