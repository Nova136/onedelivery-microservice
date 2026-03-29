import "dotenv/config"; // Make sure your script runs with the env loaded

import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { v4 as uuidv4 } from "uuid";
import { LogisticsAgentService } from "../src/logistics-agent.service";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { LogisticsAction } from "../src/core/dto/execute-logistics-task.dto";

// 2. Swap to evaluation-specific API keys if they exist in the .env file
console.log("1. Starting initialization...");
if (process.env.EVAL_LANGSMITH_API_KEY) {
    process.env.LANGSMITH_API_KEY = process.env.EVAL_LANGSMITH_API_KEY;
}

console.log("2. Imports loaded, initializing LangSmith Client...");

// Explicitly pass the API key to bypass import hoisting issues!
const client = new Client({
    apiKey: process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY,
});
const DATASET_NAME = "OneDelivery-Logistics-Agent-Experiments";

/**
 * Isolated test cases specifically targeting the Logistics SOP logic.
 * By testing this independently, we save tokens and bypass the Orchestrator's routing layers.
 */
const testCases = [
    {
        inputs: {
            action: "cancel_order",
            orderId: "FD-0000-000002", // CREATED status
        },
        outputs: {
            expected_status: "SUCCESS",
            expected_concept: "successfully cancelled",
        },
        metadata: {
            category: "cancellation",
            description: "Standard Cancellation (Created status)",
        },
    },
    {
        inputs: {
            action: "cancel_order",
            orderId: "FD-0000-000001", // DELIVERED status
        },
        outputs: {
            expected_status: "REJECTED",
            expected_concept: "already delivered",
        },
        metadata: {
            category: "cancellation",
            description: "Cancellation Rejection (Already Delivered)",
        },
    },
    {
        inputs: {
            action: "cancel_order",
            orderId: "FD-0000-000004", // IN_DELIVERY, > 3 hours old
        },
        outputs: {
            expected_status: "SUCCESS",
            expected_concept: "successfully cancelled",
        },
        metadata: {
            category: "cancellation",
            description: "Late Delivery Cancellation (Over 3 hours)",
        },
    },
    {
        inputs: {
            action: "cancel_order",
            orderId: "FD-0000-000008", // IN_DELIVERY, < 3 hours old
        },
        outputs: {
            expected_status: "REJECTED",
            expected_concept: "out for delivery",
        },
        metadata: {
            category: "cancellation",
            description: "Standard Out for Delivery Rejection",
        },
    },
    {
        inputs: {
            action: "cancel_order",
            orderId: "INVALID-ID-999", // Hallucinated/Missing ID
        },
        outputs: {
            expected_status: "REJECTED",
            expected_concept: "invalid or failed",
        },
        metadata: {
            category: "fallback",
            description: "Missing/Invalid Data Fallback",
        },
    },
];

/**
 * Custom Evaluator using LLM-as-a-judge to check if the AI's response captures the expected concepts
 * and has the correct expected status prefix.
 */
const llmJudgeEvaluator = async ({ run, example }: any) => {
    const prediction = run.outputs?.output || "";
    const expectedStatus = example.outputs?.expected_status || "";
    const expectedConcept = example.outputs?.expected_concept || "";

    const llm = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0,
    });

    const schema = z.object({
        passed: z
            .boolean()
            .describe(
                "Whether the prediction matches the expected status and adequately captures the expected concept.",
            ),
        reasoning: z
            .string()
            .describe("Explanation for why it passed or failed."),
    });

    const structuredLlm = llm.withStructuredOutput(schema);

    const prompt = `You are an expert AI evaluator.
Your task is to determine if the Logistics Agent's response (prediction) matches the expected outcome.

Expected Status: ${expectedStatus}
Expected Concept/Reason: ${expectedConcept}
AI Response (Prediction): ${prediction}

1. STATUS CHECK: The AI Response MUST start with the Expected Status (It is perfectly fine if it is followed by a colon and a space, e.g. "REJECTED: ").
2. CONCEPT CHECK: The AI Response MUST adequately contain the Expected Concept/Reason. Ignore exact wording, focus on semantic meaning.

Does the AI Response meet both criteria?`;

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

/**
 * LOCAL ISOLATION: Instantiate the service directly with mocked dependencies.
 * This prevents altering the actual production code in logistics-agent.service.ts!
 */
const mockKnowledgeClient = {
    searchInternalSop: async () => ({
        workflowSteps: [
            "1. Execute Get_Order_Details tool to fetch the current state of the order.",
            "2. Wait for the Get_Order_Details tool's response.",
            "3. Check the 'status' field. If the status is 'CREATED', the order is eligible for standard cancellation, proceed to step 7.",
            "4. If the status is 'PREPARATION' or 'IN_DELIVERY', the order cannot normally be cancelled. You MUST calculate the time difference between the 'updatedAt' timestamp and the CURRENT SYSTEM TIME.",
            "5. If the calculated time difference is MORE than 3 hours, the order is eligible for late-cancellation. Proceed to step 7.",
            "6. If the calculated time difference is LESS than or EQUAL to 3 hours, STOP immediately and return a rejection string stating the food is out for delivery. DO NOT execute any other tools.",
            "7. If the status is 'DELIVERED' or 'CANCELLED', the order is not eligible for cancellation. STOP immediately and return a rejection string stating the food has already been delivered/cancelled. DO NOT execute any other tools.",
            "8. If eligible for cancellation, execute the Route_To_Guardian tool to check the user's cancellation quota and fraud risk.",
            "9. Wait for the Guardian Agent's response.",
            "10. If rejected by Guardian, return a rejection string to the Orchestrator stating: 'Rejected by Guardian, requires manual review'.",
            "11. If approved by Guardian, execute the Execute_Cancellation_And_Refund tool.",
            "12. Return a simple success/failure status explicitly confirming the cancellation and refund, along with the reason, to the Orchestrator.",
        ],
    }),
} as any;

// Pass the mocks into the constructor
const logisticsService = new LogisticsAgentService(
    mockKnowledgeClient,
    {} as any,
    {} as any,
    { get: () => undefined } as any,
);

// Override the tools directly on the instance to provide mock deterministic responses
logisticsService["tools"] = {
    Get_Order_Details: new DynamicStructuredTool({
        name: "Get_Order_Details",
        description:
            "Execute this tool to fetch the current status and updatedAt timestamp of the order.",
        schema: z.object({
            orderId: z.string().describe("The exact order ID to check"),
        }),
        func: async ({ orderId }) => {
            if (orderId === "FD-0000-000002")
                return JSON.stringify({
                    status: "CREATED",
                    updatedAt: new Date().toISOString(),
                });
            if (orderId === "FD-0000-000001")
                return JSON.stringify({
                    status: "DELIVERED",
                    updatedAt: new Date().toISOString(),
                });
            if (orderId === "FD-0000-000004")
                return JSON.stringify({
                    status: "IN_DELIVERY",
                    updatedAt: new Date(
                        Date.now() - 4 * 60 * 60 * 1000,
                    ).toISOString(),
                }); // 4 hrs old
            if (orderId === "FD-0000-000008")
                return JSON.stringify({
                    status: "IN_DELIVERY",
                    updatedAt: new Date().toISOString(),
                }); // < 3 hrs old

            // Fallback for invalid or missing IDs
            return JSON.stringify({
                error: "Order not found or invalid ID",
            });
        },
    }),
    Route_To_Guardian: new DynamicStructuredTool({
        name: "Route_To_Guardian",
        description:
            "Execute this tool to check the cancellation quota and fraud risk. Must be called if order is eligible.",
        schema: z.object({
            orderId: z.string().describe("The exact order ID").optional(),
        }),
        func: async () => "SUCCESS: Approved by Guardian",
    }),
    Execute_Cancellation_And_Refund: new DynamicStructuredTool({
        name: "Execute_Cancellation_And_Refund",
        description:
            "Execute this tool to finalize the cancellation and refund.",
        schema: z.object({
            orderId: z.string().describe("The exact order ID").optional(),
        }),
        func: async () => "SUCCESS: Order successfully cancelled and refunded",
    }),
};
// Rebind the mock tools to the LLM
logisticsService["logisticsWithTools"] = logisticsService["llm"].bindTools(
    Object.values(logisticsService["tools"]),
);

/**
 * Target function to execute the logistics task.
 */
async function predictLogistics(inputs: {
    action: string;
    orderId: string;
}): Promise<{ output: string }> {
    const payload = {
        userId: "langsmith-eval-user",
        sessionId: uuidv4(),
        action: inputs.action as LogisticsAction,
        orderId: inputs.orderId,
        description: "Automated LangSmith test execution",
    };

    try {
        // Execute directly via the mocked service instance!
        const data = await logisticsService.executeTask(payload);
        return { output: data };
    } catch (error) {
        return { output: "REJECTED: Internal Mock Error" };
    }
}

async function main() {
    console.log("3. Entering main function...");

    // 3. Optional: If you explicitly want a named dataset in your UI, create/sync it here properly
    console.log(`Syncing LangSmith dataset: ${DATASET_NAME}...`);

    try {
        await client.readDataset({ datasetName: DATASET_NAME });
        console.log("Dataset already exists. Skipping example creation.");
    } catch {
        const dataset = await client.createDataset(DATASET_NAME, {
            description: "Isolated evaluations for the Logistics Backend Agent",
        });

        // Create examples only when the dataset is newly created
        await Promise.all(
            testCases.map((tc) =>
                client.createExample(tc.inputs, tc.outputs, {
                    datasetId: dataset.id,
                    metadata: tc.metadata,
                }),
            ),
        );
        console.log("Dataset synced successfully.");
    }

    console.log("Running evaluation...");

    await evaluate(
        (inputs) =>
            predictLogistics(inputs as { action: string; orderId: string }),
        {
            // You can pass DATASET_NAME here, OR just pass the array directly: data: testCases
            data: DATASET_NAME,
            evaluators: [llmJudgeEvaluator],
            experimentPrefix: "logistics-agent-isolated",
            client,
        },
    );

    console.log("Evaluation complete! Check your LangSmith dashboard.");
}

main().catch(console.error);
