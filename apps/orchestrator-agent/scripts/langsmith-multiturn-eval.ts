import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

process.env.LANGCHAIN_TRACING_V2 = "false";
if (process.env.EVAL_LANGSMITH_API_KEY) {
    process.env.LANGSMITH_API_KEY = process.env.EVAL_LANGSMITH_API_KEY;
}
if (process.env.EVAL_OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = process.env.EVAL_OPENAI_API_KEY;
}

const client = new Client({
    apiKey: process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY,
});

const DATASET_NAME = "OneDelivery-Orchestrator-MultiTurn-Experiments";

type Turn = {
    message: string;
};

const testCases = [
    {
        inputs: {
            conversation: [
                { message: "Hi, can you check order FD-0000-000008 for me?" },
                {
                    message:
                        "I want to cancel it now because I changed my mind.",
                },
            ] as Turn[],
        },
        outputs: {
            expected_concept:
                "cannot be cancelled because it is out for delivery",
        },
        metadata: {
            category: "multi_turn_cancel",
            description:
                "Second-turn cancellation request should respect delivery-state SOP.",
        },
    },
    {
        inputs: {
            conversation: [
                {
                    message:
                        "My order FD-0000-000001 had 1 missing item and I need a refund.",
                },
                { message: "The missing item is 1 Laksa." },
            ] as Turn[],
        },
        outputs: {
            expected_concept: "refund",
        },
        metadata: {
            category: "multi_turn_refund",
            description:
                "Follow-up turn provides details and should lead to refund guidance.",
        },
    },
    {
        inputs: {
            conversation: [
                { message: "What are your delivery hours?" },
                {
                    message:
                        "Also cancel order FD-0000-000002 right now please.",
                },
            ] as Turn[],
        },
        outputs: {
            expected_concept: "cancelled",
        },
        metadata: {
            category: "multi_turn_routing",
            description:
                "Mixed FAQ then action; action in later turn should still be handled.",
        },
    },
];

const llmJudgeEvaluator = async ({ run, example }: any) => {
    const prediction = run.outputs?.output || "";
    const expectedConcept = example.outputs?.expected_concept || "";
    const conversation = JSON.stringify(example.inputs?.conversation ?? []);

    const llm = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0,
    });

    const schema = z.object({
        passed: z.boolean(),
        reasoning: z.string(),
    });

    const structuredLlm = (llm as any).withStructuredOutput(schema as any);
    const prompt = `You are an evaluator for a multi-turn support assistant.

Conversation History: ${conversation}
Expected Concept: ${expectedConcept}
Assistant Final Response: ${prediction}

Decide if the final response adequately addresses the conversation and contains the expected concept.
Ignore exact wording; judge semantic correctness and policy alignment.`;

    try {
        const result = (await structuredLlm.invoke(prompt)) as {
            passed: boolean;
            reasoning: string;
        };
        return {
            key: "llm_multiturn_concept_match",
            score: result.passed ? 1 : 0,
            comment: result.reasoning,
        };
    } catch (error) {
        return {
            key: "llm_multiturn_concept_match",
            score: 0,
            comment: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
};

async function predictMultiTurn(inputs: {
    conversation: Turn[];
}): Promise<{ output: string }> {
    const sessionId = uuidv4();
    let latestReply = "";

    for (const turn of inputs.conversation ?? []) {
        const response = await fetch("http://localhost:3010/orchestrator-agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: "langsmith-eval-user",
                sessionId,
                message: turn.message,
            }),
        });

        if (!response.ok) {
            return { output: "Error calling orchestrator agent" };
        }

        const data = await response.json();
        latestReply = data.reply ?? "";
    }

    return { output: latestReply };
}

async function main() {
    console.log(`Syncing LangSmith dataset: ${DATASET_NAME}...`);
    try {
        await client.readDataset({ datasetName: DATASET_NAME });
        console.log("Dataset already exists. Skipping creation.");
    } catch {
        const dataset = await client.createDataset(DATASET_NAME, {
            description: "Multi-turn evaluations for OneDelivery Orchestrator Agent",
        });
        await client.createExamples({
            datasetId: dataset.id,
            inputs: testCases.map((tc) => tc.inputs),
            outputs: testCases.map((tc) => tc.outputs),
            metadata: testCases.map((tc) => tc.metadata),
        });
        console.log("Dataset populated successfully.");
    }

    console.log("Running multi-turn evaluation...");
    await evaluate(
        (inputs) => predictMultiTurn(inputs as { conversation: Turn[] }),
        {
            data: DATASET_NAME,
            evaluators: [llmJudgeEvaluator],
            experimentPrefix: "orchestrator-multiturn-eval",
            client,
        },
    );

    console.log("Multi-turn evaluation complete! Check your LangSmith dashboard.");
}

main().catch(console.error);
