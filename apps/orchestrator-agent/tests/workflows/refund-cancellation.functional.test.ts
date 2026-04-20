import "dotenv/config";
import { PromptShieldService } from "../../src/modules/prompt-shield/prompt-shield.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { HumanMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StructuredTool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import * as path from "path";
import { createSopHandlerNode } from "../../src/orchestrator-agent/nodes/sop-handler.node";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";

require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env") });

const DATASET_NAME = "Orchestrator-Refund-Cancellation-Workflow";

class LLMJudge {
    private model: BaseChatModel;

    constructor() {
        // Use gpt-4o for reasoning-heavy evaluation
        this.model = new ChatOpenAI({
            modelName: "gpt-4o",
            apiKey: process.env.OPENAI_API_KEY,
            temperature: 0,
        });
    }

    async evaluate(
        input: string,
        response: string,
        expectedOutcome: string,
    ): Promise<{ score: number; reasoning: string }> {
        const prompt = `
        You are an impartial judge evaluating the performance of a customer support AI.
        
        User Input: "${input}"
        AI Response: "${response}"
        Expected Outcome: "${expectedOutcome}"
        
        Evaluate if the AI followed the procedure correctly. 
        - Did it ask for missing information?
        - Did it provide a clear summary?
        - Did it follow the SOP logic?
        
        Return a score from 0 to 1 and a brief reasoning.
        Respond in JSON format: { "score": number, "reasoning": string }
        `;

        const res = await this.model.invoke(prompt);
        try {
            const content =
                typeof res.content === "string"
                    ? res.content
                    : JSON.stringify(res.content);
            return JSON.parse(content.replace(/```json|```/g, ""));
        } catch (e) {
            return { score: 0, reasoning: "Failed to parse judge output." };
        }
    }
}

const testCases = [
    {
        inputs: {
            intent: "REQUEST_REFUND",
            input: "I want a refund for order #12345.",
            initialOrderStates: { orderId: "12345" },
        },
        outputs: {
            expectedOutcome:
                "The agent should identify that issueCategory and description are missing and ask for them.",
        },
        metadata: {
            category: "Refund",
            description: "Missing Issue Category & Description",
        },
    },
    {
        inputs: {
            intent: "REQUEST_REFUND",
            input: "I want a refund for order #12345 because some items are missing.",
            initialOrderStates: { orderId: "12345" },
        },
        outputs: {
            expectedOutcome:
                "The agent should identify the category as 'missing_item' and output a system instruction to ask for confirmation of the gathered details.",
        },
        metadata: {
            category: "Refund",
            description: "Missing Items for Missing Item Category",
        },
    },
    {
        inputs: {
            intent: "REQUEST_REFUND",
            input: "I want a refund for order #12345. The food was cold and spilled everywhere.",
            initialOrderStates: {},
        },
        outputs: {
            expectedOutcome:
                "The agent should extract orderId #12345, category 'quality_issue', and the description, and output a system instruction to ask for confirmation.",
        },
        metadata: {
            category: "Refund",
            description: "Full Data Provided (Quality Issue)",
        },
    },
    {
        inputs: {
            intent: "CANCEL_ORDER",
            input: "Please cancel my order #9999.",
            initialOrderStates: { orderId: "9999" },
        },
        outputs: {
            expectedOutcome:
                "The agent should identify the missing description (reason) and ask why the user wants to cancel.",
        },
        metadata: {
            category: "Cancellation",
            description: "Missing Description",
        },
    },
    {
        inputs: {
            intent: "CANCEL_ORDER",
            input: "Cancel order #9999. I've been waiting for 2 hours and I'm not hungry anymore.",
            initialOrderStates: {},
        },
        outputs: {
            expectedOutcome:
                "The agent should extract orderId #9999 and the description, and output a system instruction to ask for confirmation.",
        },
        metadata: {
            category: "Cancellation",
            description: "Full Data Provided",
        },
    },
];

async function target(inputs: {
    intent: string;
    input: string;
    initialOrderStates: any;
}) {
    const llm = new ChatOpenAI({
        modelName: "gpt-5.4-mini",
        apiKey: process.env.OPENAI_API_KEY,
        temperature: 0,
    });

    const geminiFallback = new ChatGoogleGenerativeAI({
        model: "gemini-3.1-flash-preview",
        apiKey: process.env.GEMINI_API_KEY || "mock-key",
    });

    llm.withFallbacks({
        fallbacks: [geminiFallback],
    });

    const mockKnowledgeClient = {
        searchInternalSop: async (params: any) => {
            if (params.intentCode === "REQUEST_REFUND") {
                return {
                    intentCode: "REQUEST_REFUND",
                    title: "Refund Request",
                    requiredData: [
                        {
                            name: "orderId",
                            type: "string",
                            description: "The order ID",
                        },
                        {
                            name: "issueCategory",
                            type: "string",
                            description: "The category of the issue",
                        },
                        {
                            name: "description",
                            type: "string",
                            description: "Description of the issue",
                        },
                    ],
                    resolutionTool: "Route_To_Resolution",
                };
            }
            if (params.intentCode === "CANCEL_ORDER") {
                return {
                    intentCode: "CANCEL_ORDER",
                    title: "Cancel Order",
                    requiredData: [
                        {
                            name: "orderId",
                            type: "string",
                            description: "The order ID",
                        },
                        {
                            name: "reason",
                            type: "string",
                            description: "Reason for cancellation",
                        },
                    ],
                    resolutionTool: "Route_To_Resolution",
                };
            }
            return null;
        },
    };

    class MockResolutionTool extends StructuredTool {
        name = "Route_To_Resolution";
        description =
            "Route the request to the resolution team for refund processing.";
        schema = z.object({
            orderId: z.string(),
            issueCategory: z.string(),
            description: z.string(),
            items: z
                .array(z.object({ name: z.string(), quantity: z.number() }))
                .optional(),
        });
        async _call(input: any) {
            return `Refund request for order ${input.orderId} (${input.issueCategory}) routed to resolution team. Description: ${input.description}`;
        }
    }

    class MockLogisticsTool extends StructuredTool {
        name = "Route_To_Logistics";
        description =
            "Route the request to the logistics team for order cancellation.";
        schema = z.object({ orderId: z.string(), description: z.string() });
        async _call(input: any) {
            return `Cancellation request for order ${input.orderId} routed to logistics team. Reason: ${input.description}`;
        }
    }

    const tools = [new MockResolutionTool(), new MockLogisticsTool()];
    const promptShield = new PromptShieldService();
    const auditService = new AuditService();
    const sopHandler = createSopHandlerNode({
        llm: llm,
        llmFallback: geminiFallback,
        tools,
        knowledgeClient: mockKnowledgeClient as any,
        promptShield,
        auditService,
    });

    const state: any = {
        messages: [new HumanMessage(inputs.input)],
        user_id: "test-user",
        session_id: `session-${Date.now()}`,
        user_orders: [
            {
                orderId: "12345",
                status: "DELIVERED",
                createdAt: new Date().toISOString(),
            },
            {
                orderId: "9999",
                status: "IN_TRANSIT",
                createdAt: new Date().toISOString(),
            },
        ],
        summary: "",
        current_intent: inputs.intent,
        decomposed_intents: [{ intent: inputs.intent, query: inputs.input }],
        order_states: inputs.initialOrderStates,
        is_awaiting_confirmation: false,
        multi_intent_acknowledged: true,
    };

    const result: any = await sopHandler(state);
    return { response: result.partial_responses?.[0] || "" };
}

const workflowEvaluator = async ({ run, example }: any) => {
    const input = example.inputs.input;
    const expectedOutcome = example.outputs.expectedOutcome;
    const response = run.outputs?.response || "";

    const judge = new LLMJudge();
    const evaluation = await judge.evaluate(input, response, expectedOutcome);

    return {
        key: "workflow_logic_accuracy",
        score: evaluation.score,
        comment: evaluation.reasoning,
    };
};

async function main() {
    if (!process.env.OPENAI_API_KEY) {
        console.log("Skipping workflow tests: OPENAI_API_KEY not set.");
        return;
    }

    const client = new Client();
    console.log(`Syncing LangSmith dataset: ${DATASET_NAME}...`);

    try {
        await client.readDataset({ datasetName: DATASET_NAME });
        console.log("Dataset already exists. Skipping creation.");
    } catch {
        const dataset = await client.createDataset(DATASET_NAME, {
            description:
                "Functional tests evaluating the SOP handler's ability to extract missing information and follow logic.",
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
        experimentPrefix: "refund-cancellation-workflow",
        client,
    });
    console.log("Evaluation complete! Check your LangSmith dashboard.");
}

main().catch(console.error);
