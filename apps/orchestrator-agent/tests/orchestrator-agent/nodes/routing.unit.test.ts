import { createRoutingNode } from "../../../src/orchestrator-agent/nodes/routing.node";
import { HumanMessage } from "@langchain/core/messages";

async function runTests() {
    console.log("--- STARTING ROUTING NODE UNIT TESTS ---\n");
    let passed = 0;
    let total = 0;

    const test = async (name: string, fn: () => Promise<void> | void) => {
        total++;
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (e) {
            console.log(`❌ ${name}`);
            console.error(e);
        }
    };

    const mockIntentClassifier = {
        classifyIntents: async () => ({
            decomposed: [{ intent: "faq", query: "test" }],
        }),
    };

    const mockLlm = {
        withStructuredOutput: () => ({
            withFallbacks: () => ({
                invoke: async () => ({
                    thought: "test",
                    wants_to_proceed: true,
                }),
            }),
        }),
    };

    const mockKnowledgeClient = {
        listOrchestratorSops: async () => [{ intentCode: "REFUND" }],
    };

    const deps = {
        intentClassifier: mockIntentClassifier as any,
        llm: mockLlm as any,
        llmFallback: mockLlm as any,
        knowledgeClient: mockKnowledgeClient as any,
    };

    const routingNode = createRoutingNode(deps);

    await test("Basic routing to FAQ", async () => {
        const state: any = {
            messages: [new HumanMessage("hello")],
            session_id: "test",
            is_awaiting_confirmation: false,
            remaining_intents: [],
            user_orders: [],
        };
        const result = await routingNode(state);
        if (result.decomposed_intents[0].intent !== "faq")
            throw new Error("Expected faq intent");
    });

    await test("Routing with confirmation - user wants to proceed", async () => {
        const state: any = {
            messages: [new HumanMessage("yes")],
            session_id: "test",
            is_awaiting_confirmation: true,
            remaining_intents: [{ intent: "REFUND", query: "refund me" }],
            user_orders: [],
        };
        const result = await routingNode(state);
        if (result.decomposed_intents[0].intent !== "REFUND")
            throw new Error("Expected REFUND intent");
        if (result.is_awaiting_confirmation !== false)
            throw new Error("Expected confirmation to be reset");
    });

    await test("Routing with confirmation - user does NOT want to proceed", async () => {
        const mockLlmNo = {
            withStructuredOutput: () => ({
                withFallbacks: () => ({
                    invoke: async () => ({
                        thought: "test",
                        wants_to_proceed: false,
                    }),
                }),
            }),
        };
        const routingNodeNo = createRoutingNode({
            ...deps,
            llm: mockLlmNo as any,
        });
        const state: any = {
            messages: [new HumanMessage("no")],
            session_id: "test",
            is_awaiting_confirmation: true,
            remaining_intents: [{ intent: "REFUND", query: "refund me" }],
            user_orders: [],
        };
        const result = await routingNodeNo(state);
        if (result.decomposed_intents[0].intent !== "faq")
            throw new Error("Expected fallback to normal classification (faq)");
        if (result.remaining_intents.length !== 0)
            throw new Error("Expected remaining intents to be cleared");
    });

    await test("Stray confirmation handling", async () => {
        const mockIntentClassifierConf = {
            classifyIntents: async () => ({
                decomposed: [{ intent: "confirmation", query: "yes" }],
            }),
        };
        const routingNodeConf = createRoutingNode({
            ...deps,
            intentClassifier: mockIntentClassifierConf as any,
        });
        const state: any = {
            messages: [new HumanMessage("yes")],
            session_id: "test",
            is_awaiting_confirmation: false,
            remaining_intents: [],
            user_orders: [],
        };
        const result = await routingNodeConf(state);
        if (result.decomposed_intents[0].intent !== "general")
            throw new Error(
                "Expected stray confirmation to be routed to general",
            );
    });

    if (passed !== total) {
        throw new Error(
            `ROUTING NODE UNIT TESTS FAILED: ${passed}/${total} passed`,
        );
    }
}

describe("RoutingNode", () => {
    it("runs all internal unit checks", async () => {
        await runTests();
    });
});
