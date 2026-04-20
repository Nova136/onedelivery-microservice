import { IntentClassifierService } from "../../../src/modules/intent-classifier/intent-classifier.service";
import dotenv from "dotenv";
import * as path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";

dotenv.config({ path: path.resolve(__dirname, "../../../../../.env") });
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "mock-key";

class LLMJudge {
    private model: ChatOpenAI;

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
        actualIntents: string[],
        expectedIntents: string[],
    ): Promise<{ score: number; reasoning: string }> {
        const schema = z.object({
            score: z.number().describe("A score from 0 to 1"),
            reasoning: z.string().describe("Brief reasoning for the score"),
        });

        const structuredLlm = this.model.withStructuredOutput(schema);

        const prompt = `
        You are an impartial judge evaluating the performance of an intent classification AI.
        
        User Input: "${input}"
        Actual Intents Output: [${actualIntents.join(", ")}]
        Expected Intents: [${expectedIntents.join(", ")}]
        
        Evaluate if the actual intents properly capture the expected intents for the user input.
        Consider that exact matches are perfect (score 1.0). If the actual intents are semantically equivalent or acceptable given the context, you can score it between 0.8 and 1.0. If it completely missed the mark, give it a 0.
        `;

        try {
            const res = await structuredLlm.invoke(prompt);
            return res as { score: number; reasoning: string };
        } catch (e) {
            return { score: 0, reasoning: "Evaluation failed." };
        }
    }
}

async function generateDynamicQueries(
    count: number,
): Promise<Array<{ input: string; expectedIntents: string[] }>> {
    console.log(`\n🤖 Generating ${count} dynamic customer queries...`);
    const generatorLlm = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0.8,
        maxTokens: 800, // Reasoning/Generator limit
    });

    const schema = z.object({
        queries: z
            .array(
                z.object({
                    input: z
                        .string()
                        .describe(
                            "A highly realistic, messy, or complex customer query (e.g., using slang, typos, or combining multiple intents).",
                        ),
                    expectedIntents: z
                        .array(
                            z.enum([
                                "CANCEL_ORDER",
                                "REQUEST_REFUND",
                                "faq",
                                "general",
                                "escalate",
                                "end_session",
                            ]),
                        )
                        .describe("The expected intent codes."),
                }),
            )
            .length(count),
    });

    const structuredLlm = generatorLlm.withStructuredOutput(schema);

    const res = await structuredLlm.invoke(
        `You are an expert QA tester for a food delivery app called OneDelivery.
        Your task is to generate highly realistic, challenging customer service queries (e.g., using slang, typos, emotional language, or combining multiple intents).
        
        Here are the valid intent categories and the strict rules for mapping them:
        - CANCEL_ORDER: The user wants to cancel their order. Map to this even if they mention a refund alongside the cancellation.
        - REQUEST_REFUND: The user has a problem with an order (missing items, quality issue, wrong items, late delivery) and wants compensation.
        - faq: Questions about public policies (delivery fees, payment methods, delivery zones).
        - escalate: The user is highly abusive, threatening legal action, or explicitly demanding a human/manager.
        - end_session: The user is saying goodbye or thanking the agent.
        - general: Basic greetings, or completely OUT-OF-SCOPE questions (e.g., medical advice, stock market, news, asking about competitors).
        
        Generate ${count} queries and accurately map them to the expectedIntents array based ONLY on these rules.`,
    );

    return res.queries as Array<{ input: string; expectedIntents: string[] }>;
}

const client = new Client();
const DATASET_NAME = "Orchestrator-Intent-Classifier-Functional-Tests";

const llmJudgeEvaluator = async ({ run, example }: any) => {
    const judge = new LLMJudge();
    const input = example.inputs.input;
    const actualIntents = run.outputs?.intents || [];
    const expectedIntents = example.outputs.expectedIntents || [];

    const evaluation = await judge.evaluate(
        input,
        actualIntents,
        expectedIntents,
    );

    return {
        key: "llm_judge_intent_match",
        score: evaluation.score,
        comment: evaluation.reasoning,
    };
};

async function target(inputs: {
    input: string;
}): Promise<{ intents: string[] }> {
    const mockKnowledgeClient = {
        listOrchestratorSops: async () => [
            {
                intentCode: "CANCEL_ORDER",
                title: "Cancel an order and process its automatic refund. Use this for any request to cancel, even if a refund is mentioned for the same order.",
            },
            {
                intentCode: "REQUEST_REFUND",
                title: "Asking for money back for missing or wrong items or quality issue or late delivery.",
            },
        ],
    };
    const router = new IntentClassifierService(mockKnowledgeClient as any);

    const messages = [new HumanMessage(inputs.input)];
    const { intents } = await router.classifyIntents(messages, "", [], "None");
    return { intents };
}

async function main() {
    const testCases: Array<{
        name: string;
        input: string;
        expectedIntents: string[];
    }> = [
        {
            name: "General: Out-of-Scope (Medical)",
            input: "How do I treat a fever?",
            expectedIntents: ["general"],
        },
        {
            name: "General: Out-of-Scope (Financial)",
            input: "What stock should I buy?",
            expectedIntents: ["general"],
        },
        {
            name: "General: Out-of-Scope (Competitor)",
            input: "Does Grab deliver faster than you?",
            expectedIntents: ["general"],
        },
        {
            name: "General: Out-of-Scope (News)",
            input: "Who is winning the war?",
            expectedIntents: ["general"],
        },
        {
            name: "Logistics: Cancel Order",
            input: "Where is my OneDelivery order #FOOD-12345? It is late. I want a cancel and refund.",
            expectedIntents: ["CANCEL_ORDER"],
        },
        {
            name: "Logistics: Delivery Delay",
            input: "Why did you delivber burgers instead of fries for my order #FOOD-12345?",
            expectedIntents: ["REQUEST_REFUND"],
        },
        {
            name: "Resolution: Cold Food",
            input: "My burger arrived cold and soggy.",
            expectedIntents: ["REQUEST_REFUND"],
        },
        {
            name: "Resolution: Refund Request",
            input: "I want a refund for my missing fries.",
            expectedIntents: ["REQUEST_REFUND"],
        },
        {
            name: "FAQ: Delivery Zones",
            input: "I have a question: Do you deliver to the downtown area?",
            expectedIntents: ["faq"],
        },
        {
            name: "FAQ: Payment Methods",
            input: "What payment methods do you accept?",
            expectedIntents: ["faq"],
        },
        {
            name: "Escalate: Human Agent",
            input: "I want to talk to a real person.",
            expectedIntents: ["escalate"],
        },
        {
            name: "Escalate: Legal Threat",
            input: "I'm going to sue you for this!",
            expectedIntents: ["escalate"],
        },
        {
            name: "End Session: Goodbye",
            input: "Thanks for your help, goodbye!",
            expectedIntents: ["end_session"],
        },
        {
            name: "General: Greeting",
            input: "Hello there!",
            expectedIntents: ["general"],
        },
        {
            name: "Mixed: Delay and Frustration",
            input: "My order is late and I'm very angry, I want to talk to someone!",
            expectedIntents: ["escalate"],
        },
        {
            name: "Multi-Intent: General and FAQ",
            input: "what is yesterday's toto wining number? Who is the winner of the world cup? What is your cancellation policies",
            expectedIntents: ["faq", "general"],
        },
    ];

    // --- DYNAMIC QUERIES: LLM FUZZING ---
    try {
        const dynamicQueries = await generateDynamicQueries(3);
        dynamicQueries.forEach((q, index) => {
            testCases.push({
                name: `Dynamic: Fuzzed Query ${index + 1}`,
                input: q.input,
                expectedIntents: q.expectedIntents,
            });
        });
    } catch (e) {
        console.log(
            "⚠️ Failed to generate dynamic queries, proceeding with static tests.",
        );
    }

    console.log(`Syncing LangSmith dataset: ${DATASET_NAME}...`);

    try {
        await client.readDataset({ datasetName: DATASET_NAME });
        console.log(
            "Dataset already exists. Deleting and recreating to ensure freshness.",
        );
        await client.deleteDataset({ datasetName: DATASET_NAME });
    } catch {
        // Dataset does not exist, which is fine.
    }

    const dataset = await client.createDataset(DATASET_NAME, {
        description:
            "Functional and fuzz tests for the Orchestrator's Intent Classifier.",
    });

    await Promise.all(
        testCases.map((tc) =>
            client.createExample(
                { input: tc.input }, // inputs
                { expectedIntents: tc.expectedIntents }, // outputs
                {
                    datasetId: dataset.id,
                    metadata: { name: tc.name },
                },
            ),
        ),
    );
    console.log("Dataset populated successfully.");

    console.log("--- STARTING LANGSMITH EVALUATION ---\n");

    await evaluate(target, {
        data: DATASET_NAME,
        evaluators: [llmJudgeEvaluator],
        experimentPrefix: "intent-classifier-functional",
        client,
    });

    console.log(
        "\n--- EVALUATION COMPLETE! Check your LangSmith dashboard. ---",
    );
}

main();
