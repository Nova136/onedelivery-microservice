import { createSelfCorrectionNode } from "../../../src/orchestrator-agent/nodes/self-correction.node";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

async function runTests() {
    console.log("--- STARTING SELF-CORRECTION NODE UNIT TESTS ---\n");
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

    const mockLlm = {
        withStructuredOutput: () => ({
            withFallbacks: () => ({
                invoke: async () => ({
                    thought: "test",
                    corrected_response: "Corrected output",
                }),
            }),
        }),
    };

    const deps = {
        llm: mockLlm as any,
        llmFallback: mockLlm as any,
    };

    const selfCorrectionNode = createSelfCorrectionNode(deps);

    await test("Self-correct output", async () => {
        const state: any = {
            messages: [
                new HumanMessage("hello"),
                new AIMessage("original output"),
            ],
            session_id: "test",
            summary: "test",
            last_evaluation: { issues: ["bias"] },
            retry_count: 0,
        };
        const result = await selfCorrectionNode(state);
        if (
            result.messages[result.messages.length - 1].content !==
            "Corrected output"
        )
            throw new Error("Expected corrected output");
        if (result.retry_count !== 1)
            throw new Error("Expected retry count increment");
    });

    await test("Fallback to original output on LLM failure", async () => {
        const mockLlmFail = {
            withStructuredOutput: () => ({
                withFallbacks: () => ({
                    invoke: async () => {
                        throw new Error("LLM failed");
                    },
                }),
            }),
        };
        const selfCorrectionNodeFail = createSelfCorrectionNode({
            ...deps,
            llm: mockLlmFail as any,
        });
        const state: any = {
            messages: [
                new HumanMessage("hello"),
                new AIMessage("original output"),
            ],
            session_id: "test",
            summary: "test",
            last_evaluation: { issues: ["bias"] },
            retry_count: 0,
        };
        const result = await selfCorrectionNodeFail(state);
        if (
            result.messages[result.messages.length - 1].content !==
            "original output"
        )
            throw new Error("Expected original output fallback");
    });

    if (passed !== total) {
        throw new Error(
            `SELF-CORRECTION NODE UNIT TESTS FAILED: ${passed}/${total} passed`,
        );
    }
}

describe("SelfCorrectionNode", () => {
    it("runs all internal unit checks", async () => {
        await runTests();
    });
});
