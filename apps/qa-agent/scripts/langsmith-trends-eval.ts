import "dotenv/config";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { AppService } from "../src/app.service";

const BASE_DATASET_NAME = "OneDelivery-QA-Agent-Trend-Dataset";

const monthlyIncidents = [
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

const mockCommonService = {
    sendViaRMQ: async (_client: any, pattern: any, payload: any) => {
        if (pattern.cmd === "incident.getByDateRange") {
            return monthlyIncidents;
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
            expected_tool: "get_incidents_by_date_range",
            expected_total: 5,
            expected_most_common: "LATE_DELIVERY",
            expected_percentage: 60,
            expected_trend: "NA",
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
    const toolCallsMade: any[] = [];
    const originalTool = qaService["tools"].get_incidents_by_date_range;

    qaService["tools"].get_incidents_by_date_range = {
        invoke: async (args: any) => {
            toolCallsMade.push({ tool: "get_incidents_by_date_range", args });
            return JSON.stringify({
                summary: `Fetched ${monthlyIncidents.length} incidents.`,
                data: monthlyIncidents,
            });
        },
    } as any;

    try {
        const result = await qaService.analyzeTrends();
        return {
            output: result,
            toolCalls: toolCallsMade,
        };
    } finally {
        qaService["tools"].get_incidents_by_date_range = originalTool;
    }
}

const trendEvaluator = async ({ run, example }: any) => {
    const output = run.outputs?.output ?? {};
    const toolCalls = run.outputs?.toolCalls ?? [];

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
- Tool call required: ${example.outputs.expected_tool}
- Expected totalByThisMonth: ${example.outputs.expected_total}
- Expected mostCommon: ${example.outputs.expected_most_common}
- Expected percentage: ${example.outputs.expected_percentage}
- Expected trend: ${example.outputs.expected_trend}

Actual tool calls:
${JSON.stringify(toolCalls, null, 2)}

Actual output:
${JSON.stringify(output, null, 2)}

Pass criteria:
1. get_incidents_by_date_range must be called at least once.
2. Output must be a JSON object with keys totalByThisMonth, mostCommon, percentage, trend, peakTime, issues.
3. totalByThisMonth must equal expected_total.
4. mostCommon must equal expected_most_common.
5. percentage must be correct or very close to expected_percentage.
6. trend must equal expected_trend unless the output clearly explains insufficient prior-month data.

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
