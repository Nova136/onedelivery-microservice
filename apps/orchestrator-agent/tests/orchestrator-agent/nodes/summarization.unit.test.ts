import { createSummarizationNode } from "../../../src/orchestrator-agent/nodes/summarization.node";
import { HumanMessage } from "@langchain/core/messages";

async function runTests() {
    console.log("--- STARTING SUMMARIZATION NODE UNIT TESTS ---\n");
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

    const summarizationNode = createSummarizationNode();

    await test("No truncation for short history", async () => {
        const messages = Array(5).fill(new HumanMessage("test"));
        const state: any = { messages, session_id: "test" };
        const result = await summarizationNode(state);
        if (result.messages.length !== 5)
            throw new Error("Expected 5 messages");
    });

    await test("Truncation for long history", async () => {
        const messages = Array(15).fill(new HumanMessage("test"));
        const state: any = { messages, session_id: "test" };
        const result = await summarizationNode(state);
        if (result.messages.length !== 6)
            throw new Error("Expected 6 messages (last 6)");
    });

    if (passed !== total) {
        throw new Error(
            `SUMMARIZATION NODE UNIT TESTS FAILED: ${passed}/${total} passed`,
        );
    }
}

describe("SummarizationNode", () => {
    it("runs all internal unit checks", async () => {
        await runTests();
    });
});
