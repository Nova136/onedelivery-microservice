import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { ResolutionService } from "../src/resolution.service";

// Load environment variables from the root .env file.
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

// Keep eval traces separate from regular project traces.
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
const DATASET_NAME = "OneDelivery-Resolution-Agent-Experiments";

const testCases = [
    {
        inputs: {
            orderId: "FD-RES-0001",
            issueCategory: "missing_item",
            items: [{ name: "Laksa", quantity: 1 }],
        },
        outputs: {
            expected_status: "SUCCESS",
            expected_concept: "processed for order",
        },
        metadata: {
            category: "refund",
            description: "Standard small missing-item refund succeeds",
        },
    },
    {
        inputs: {
            orderId: "FD-RES-0005",
            issueCategory: "missing_item",
            description:
                "Customer claims Laksa should be $10 each, refund 2 Laksa at that price.",
            items: [{ name: "Laksa", quantity: 2 }],
        },
        outputs: {
            expected_status: "SUCCESS",
            expected_concept: "$13",
        },
        metadata: {
            category: "pricing-integrity",
            description:
                "Ignore user-defined pricing claims and use order unit price (2 x 6.5 = 13)",
        },
    },
    {
        inputs: {
            orderId: "FD-RES-0002",
            issueCategory: "wrong_item",
            items: [{ name: "Lobster", quantity: 1 }],
        },
        outputs: {
            expected_status: "REJECTED",
            expected_concept: "auto-approval limit",
        },
        metadata: {
            category: "preflight",
            description: "Amount over $20 rejected before agent loop",
        },
    },
    {
        inputs: {
            orderId: "FD-RES-0006",
            issueCategory: "missing_item",
            items: [{ name: "Laksa", quantity: 2 }],
        },
        outputs: {
            expected_status: "REJECTED",
            expected_concept: "exceeds eligible quantity",
        },
        metadata: {
            category: "preflight",
            description:
                "Reject when requested refund quantity exceeds ordered/eligible quantity",
        },
    },
    {
        inputs: {
            orderId: "FD-RES-0003",
            issueCategory: "missing_item",
            items: [{ name: "Chicken Rice", quantity: 1 }],
        },
        outputs: {
            expected_status: "REJECTED",
            expected_concept: "refundStatus is NONE",
        },
        metadata: {
            category: "preflight",
            description: "Reject when order refundStatus is not NONE",
        },
    },
    {
        inputs: {
            orderId: "FD-RES-INVALID",
            issueCategory: "missing_item",
            items: [{ name: "Laksa", quantity: 1 }],
        },
        outputs: {
            expected_status: "REJECTED",
            expected_concept: "order not found",
        },
        metadata: {
            category: "fallback",
            description: "Invalid order id should be rejected by agent",
        },
    },
];

const llmJudgeEvaluator = async ({ run, example }: any) => {
    const prediction = run.outputs?.output || "";
    const expectedStatus = example.outputs?.expected_status || "";
    const expectedConcept = example.outputs?.expected_concept || "";
    const inputPayload = JSON.stringify(example.inputs ?? {});

    const llm = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0,
    });

    const schema = z.object({
        passed: z
            .boolean()
            .describe(
                "Whether the prediction matches expected status and expected concept.",
            ),
        reasoning: z
            .string()
            .describe("Reasoning for why the prediction passed or failed."),
    });

    // Avoid excessive generic expansion in TS for eval script context.
    const structuredLlm = (llm as any).withStructuredOutput(schema as any);

    const prompt = `You are an expert evaluator for backend-agent outputs.
Determine if the Resolution Agent prediction satisfies the expected outcome.

Input Payload: ${inputPayload}
Expected Status Prefix: ${expectedStatus}
Expected Concept: ${expectedConcept}
Prediction: ${prediction}

Checks:
1) STATUS CHECK: Prediction must start with the expected status prefix (for example "REJECTED:" is acceptable for "REJECTED").
2) CONCEPT CHECK: Prediction must semantically contain the expected concept.

Return pass=true only if both checks pass.`;

    try {
        const result = (await structuredLlm.invoke(prompt)) as {
            passed: boolean;
            reasoning: string;
        };
        return {
            key: "llm_status_and_concept_match",
            score: result.passed ? 1 : 0,
            comment: result.reasoning,
        };
    } catch (error) {
        return {
            key: "llm_status_and_concept_match",
            score: 0,
            comment: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
};

const mockKnowledgeClient = {
    searchInternalSop: async () => ({
        workflowSteps: [
            "1. Get order details first.",
            "2. Reject if refundStatus is not NONE.",
            "3. Compute amount from quantity x unit price.",
            "4. Reject if amount is greater than $20.",
            "5. For amount <= $20, get guardian approval.",
            "6. If approved, execute refund and return SUCCESS.",
        ],
    }),
} as any;

type OrderItem = {
    id: string;
    productName: string;
    price: number;
    quantityOrdered: number;
    quantityRefunded: number;
};

const orderFixtures: Record<
    string,
    {
        found: boolean;
        orderId: string;
        refundStatus: string;
        items: OrderItem[];
        deliveredAt: string;
    }
> = {
    "FD-RES-0001": {
        found: true,
        orderId: "FD-RES-0001",
        refundStatus: "NONE",
        deliveredAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        items: [
            {
                id: "oi-1001",
                productName: "Laksa",
                price: 6.5,
                quantityOrdered: 2,
                quantityRefunded: 0,
            },
        ],
    },
    "FD-RES-0002": {
        found: true,
        orderId: "FD-RES-0002",
        refundStatus: "NONE",
        deliveredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        items: [
            {
                id: "oi-2001",
                productName: "Lobster",
                price: 50,
                quantityOrdered: 1,
                quantityRefunded: 0,
            },
        ],
    },
    "FD-RES-0003": {
        found: true,
        orderId: "FD-RES-0003",
        refundStatus: "PARTIALLY_REFUNDED",
        deliveredAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        items: [
            {
                id: "oi-3001",
                productName: "Chicken Rice",
                price: 5.5,
                quantityOrdered: 1,
                quantityRefunded: 1,
            },
        ],
    },
    "FD-RES-0005": {
        found: true,
        orderId: "FD-RES-0005",
        refundStatus: "NONE",
        deliveredAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        items: [
            {
                id: "oi-5001",
                productName: "Laksa",
                price: 6.5,
                quantityOrdered: 3,
                quantityRefunded: 0,
            },
        ],
    },
    "FD-RES-0006": {
        found: true,
        orderId: "FD-RES-0006",
        refundStatus: "NONE",
        deliveredAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        items: [
            {
                id: "oi-6001",
                productName: "Laksa",
                price: 6.5,
                quantityOrdered: 1,
                quantityRefunded: 0,
            },
        ],
    },
};

const mockAgentsClient = {
    send: async (target: string, pattern: any, payload: any) => {
        if (target === "order" && pattern?.cmd === "order.get") {
            const order = orderFixtures[payload.orderId];
            if (!order) {
                return { found: false, orderId: payload.orderId };
            }
            return JSON.parse(JSON.stringify(order));
        }

        if (target === "payment" && pattern?.cmd === "payment.getByOrder") {
            return {
                found: true,
                paymentId: `payment-${payload.orderId}`,
            };
        }

        if (target === "payment" && pattern?.cmd === "payment.refund") {
            return {
                status: "SUCCESS",
                amount: Number(payload.amount).toFixed(2),
                refundId: `rf-${payload.paymentId}`,
            };
        }

        if (target === "order" && pattern?.cmd === "order.updateRefund") {
            const order = orderFixtures[payload.orderId];
            if (!order) return { updated: false };
            for (const req of payload.items ?? []) {
                const line = order.items.find((i) => i.id === req.orderItemId);
                if (line) {
                    line.quantityRefunded += req.quantity;
                }
            }
            order.refundStatus = "PARTIALLY_REFUNDED";
            return { updated: true };
        }

        if (target === "guardian") {
            return { reply: "APPROVED: refund policy checks passed." };
        }

        return { reply: "Unhandled mock call." };
    },
} as any;

const resolutionService = new ResolutionService(
    mockAgentsClient,
    mockKnowledgeClient,
);

async function predictResolution(inputs: {
    orderId: string;
    issueCategory: string;
    items: { name: string; quantity: number }[];
    description?: string;
}): Promise<{ output: string }> {
    try {
        const reply = await resolutionService.processRefund({
            userId: "langsmith-eval-user",
            sessionId: uuidv4(),
            message: JSON.stringify(inputs),
        } as any);
        return { output: reply };
    } catch (error) {
        return {
            output: `REJECTED: Internal mock error - ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

async function main() {
    console.log(`Syncing LangSmith dataset: ${DATASET_NAME}...`);
    try {
        await client.readDataset({ datasetName: DATASET_NAME });
        console.log("Dataset already exists. Skipping creation.");
    } catch {
        const dataset = await client.createDataset(DATASET_NAME, {
            description:
                "Isolated evaluations for the Resolution Backend Agent",
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
    await evaluate(
        (inputs) =>
            predictResolution(
                inputs as {
                    orderId: string;
                    issueCategory: string;
                    items: { name: string; quantity: number }[];
                    description?: string;
                },
            ),
        {
            data: DATASET_NAME,
            evaluators: [llmJudgeEvaluator],
            experimentPrefix: "resolution-agent-isolated",
            client,
        },
    );
    console.log("Evaluation complete! Check your LangSmith dashboard.");
}

main().catch(console.error);
