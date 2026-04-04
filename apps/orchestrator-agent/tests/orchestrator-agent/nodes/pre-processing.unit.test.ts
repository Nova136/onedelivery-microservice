import { createPreProcessingNode } from "../../../src/orchestrator-agent/nodes/pre-processing.node";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

async function runTests() {
    console.log("--- STARTING PRE-PROCESSING NODE UNIT TESTS ---\n");
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

    const mockOrderService = {
        getRecentOrders: async (userId: string) =>
            userId === "user1" ? [{ orderId: "123" }] : [],
    };

    const deps = {
        orderService: mockOrderService as any,
    };

    const preProcessingNode = createPreProcessingNode(deps);

    await test("Fetch orders for user", async () => {
        const state: any = {
            messages: [new HumanMessage("hello")],
            user_id: "user1",
            session_id: "test",
        };
        const result = await preProcessingNode(state);
        if (result.user_orders[0].orderId !== "123")
            throw new Error("Expected order 123");
    });

    await test("No orders for user", async () => {
        const state: any = {
            messages: [new HumanMessage("hello")],
            user_id: "user2",
            session_id: "test",
        };
        const result = await preProcessingNode(state);
        if (result.user_orders.length !== 0)
            throw new Error("Expected no orders");
    });

    await test("Skip if last message is not human", async () => {
        const state: any = {
            messages: [new AIMessage("hello")],
            user_id: "user1",
            session_id: "test",
        };
        const result = await preProcessingNode(state);
        if (Object.keys(result).length !== 0)
            throw new Error("Expected empty result");
    });

    if (passed !== total) {
        throw new Error(
            `PRE-PROCESSING NODE UNIT TESTS FAILED: ${passed}/${total} passed`,
        );
    }
}

describe("PreProcessingNode", () => {
    it("runs all internal unit checks", async () => {
        await runTests();
    });
});
