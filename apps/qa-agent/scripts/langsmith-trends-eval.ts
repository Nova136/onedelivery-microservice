import "dotenv/config";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { AppService } from "../src/app.service";

const BASE_DATASET_NAME = "OneDelivery-QA-Agent-Trend-Dataset";

const currentMonthIncidents = [
    {
        id: "8b55d125-e7bb-4bea-a6e3-a860c12777bd",
        type: "LATE_DELIVERY",
        orderId: "FD-0000-000001",
        userId: null,
        summary: "Shipment delayed by 24h due to weather.",
        createdAt: "2026-03-01T09:46:24.000Z",
    },
    {
        id: "be398507-da41-4881-af52-ae2dea5d3776",
        type: "DAMAGED_PACKAGING",
        orderId: null,
        userId: null,
        summary: "Customer feedback: packaging damaged.",
        createdAt: "2026-03-05T09:46:24.000Z",
    },
    {
        id: "f450ca11-d1bb-4bd4-a03a-742d26fe634c",
        type: "LATE_DELIVERY",
        orderId: "FD-0000-000002",
        userId: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
        summary: "User cancelled order due to slow delivery.",
        createdAt: "2026-03-12T13:10:18.000Z",
    },
    {
        id: "ec5046fe-968c-44f7-8fe6-9ce5e75f849d",
        type: "LATE_DELIVERY",
        orderId: "FD-0000-000004",
        userId: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
        summary:
            "User cancelled order FD-0000-000004 because it was taking too long.",
        createdAt: "2026-03-15T17:26:18.000Z",
    },
    {
        id: "cc1b60ee-fe91-44ef-9190-a773572d18b0",
        type: "MISSING_ITEMS",
        orderId: "FD-0000-000001",
        userId: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
        summary: "1 Laksa was missing.",
        createdAt: "2026-03-20T18:58:00.000Z",
    },
];

const previousMonthIncidents = [
    {
        id: "1a55d125-e7bb-4bea-a6e3-a860c12777bd",
        type: "LATE_DELIVERY",
        orderId: "FD-0000-000021",
        userId: null,
        summary: "Driver delayed by heavy traffic.",
        createdAt: "2026-02-01T18:10:00.000Z",
    },
    {
        id: "2a55d125-e7bb-4bea-a6e3-a860c12777bd",
        type: "WRONG_ORDER",
        orderId: "FD-0000-000022",
        userId: null,
        summary: "Customer received wrong meal.",
        createdAt: "2026-02-08T12:00:00.000Z",
    },
    {
        id: "3a55d125-e7bb-4bea-a6e3-a860c12777bd",
        type: "OTHER",
        orderId: "FD-0000-000023",
        userId: null,
        summary: "Unclear issue reported by customer.",
        createdAt: "2026-02-14T14:00:00.000Z",
    },
];

const mockCommonService = {
    sendViaRMQ: async (_client: any, pattern: any, payload: any) => {
        if (pattern.cmd === "incident.getByDateRange") {
            const startDate = new Date(payload.startDate);
            const currentMonth = new Date().getMonth();
            const previousMonth = (currentMonth + 11) % 12;

            if (startDate.getMonth() === previousMonth) {
                return previousMonthIncidents;
            }

            return currentMonthIncidents;
        }
        return { success: true, payload };
    },
};

const mockMemoryService = {
    getHistory: async () => [],
    saveHistory: async () => {},
};

const mockClientProxy = {
    send: () => ({ subscribe: () => {} }),
    emit: () => {},
};

const qaService = new AppService(
    mockMemoryService as any,
    mockCommonService as any,
    mockClientProxy as any,
    mockClientProxy as any,
);

const testCases = [
    {
        inputs: {
            fixtureName: "baseline-march-incidents",
        },
        outputs: {
            expected_total: 5,
            expected_most_common: "LATE_DELIVERY",
            expected_percentage: 60,
            expected_trend: "up",
            required_issue_themes: [
                "late delivery",
                "weather",
                "damaged packaging",
                "missing item",
            ],
        },
        metadata: {
            category: "trend_analysis",
        },
    },
];

async function target(_inputs: any) {
    try {
        const result = await qaService.analyzeTrends();
        return { output: result };
    } catch (error) {
        return { output: `Error: ${error.message}` };
    }
}

const trendEvaluator = async ({ run, example }: any) => {
    const output = run.outputs?.output ?? {};

    const llm = new ChatOpenAI({ modelName: "gpt-5.4-mini", temperature: 0 });
    const structuredLlm = llm.withStructuredOutput(
        z.object({
            passed: z.boolean(),
            reasoning: z.string(),
        }),
    );

    const prompt = `
Role: Strict QA evaluator for trend analysis.

Expected behavior:
- Expected totalByThisMonth: ${example.outputs.expected_total}
- Expected mostCommon: ${example.outputs.expected_most_common}
- Expected percentage: ${example.outputs.expected_percentage}
- Expected trend: ${example.outputs.expected_trend}

Actual output:
${JSON.stringify(output, null, 2)}

Pass criteria:
1. Output must be a JSON object with keys totalByThisMonth, mostCommon, percentage, trend, peakTime, issues.
2. totalByThisMonth must equal expected_total.
3. mostCommon must equal expected_most_common.
4. percentage must be correct or very close to expected_percentage.
5. trend must equal expected_trend.
6. issues must be grounded in the supplied incident summaries and not invent unsupported causes.

Return only whether it passed and a short reason.
`;

    const result = await structuredLlm.invoke(prompt);

    return {
        key: "trend_analysis_accuracy",
        score: result.passed ? 1 : 0,
        comment: result.reasoning,
    };
};

async function main() {
    const client = new Client();
    const datasetName = `${BASE_DATASET_NAME}-${Date.now()}`;

    const dataset = await client.createDataset(datasetName);

    for (const tc of testCases) {
        await client.createExample(tc.inputs, tc.outputs, {
            datasetId: dataset.id,
            metadata: tc.metadata,
        });
    }

    await evaluate(target, {
        data: datasetName,
        evaluators: [trendEvaluator],
        experimentPrefix: "qa-agent-trend-analysis",
        client,
    });
}

main().catch(console.error);
