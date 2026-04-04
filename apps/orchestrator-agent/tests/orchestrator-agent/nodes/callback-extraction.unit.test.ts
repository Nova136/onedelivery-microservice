import { createCallbackExtractionNode } from "../../../src/orchestrator-agent/nodes/callback-extraction.node";

async function runTests() {
    console.log("--- STARTING CALLBACK EXTRACTION NODE UNIT TESTS ---\n");
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
                    synthesized_message: "Synthesized message",
                }),
            }),
        }),
    };

    const mockPromptShield = {
        wrapUntrustedData: (_name: string, data: string) => data,
    };

    const deps = {
        llm: mockLlm as any,
        llmFallback: mockLlm as any,
        promptShield: mockPromptShield as any,
    };

    const callbackExtractionNode = createCallbackExtractionNode(deps);

    await test("Basic extraction of callback message", async () => {
        const state: any = {
            agent_message: "Approved",
            redacted_message: "Approved",
            is_safe: true,
            summary: "test",
        };
        const result = await callbackExtractionNode(state);
        if (result.synthesized_message !== "Synthesized message")
            throw new Error("Expected synthesized message");
    });

    await test("Unsafe callback - fallback message (approve)", async () => {
        const state: any = {
            agent_message: "Approved",
            redacted_message: "Approved",
            is_safe: false,
            summary: "test",
        };
        const result = await callbackExtractionNode(state);
        if (!result.synthesized_message.includes("approved"))
            throw new Error("Expected approved fallback");
    });

    await test("Unsafe callback - fallback message (reject)", async () => {
        const state: any = {
            agent_message: "Rejected",
            redacted_message: "Rejected",
            is_safe: false,
            summary: "test",
        };
        const result = await callbackExtractionNode(state);
        if (!result.synthesized_message.includes("rejected"))
            throw new Error("Expected rejected fallback");
    });

    if (passed !== total) {
        throw new Error(
            `CALLBACK EXTRACTION NODE UNIT TESTS FAILED: ${passed}/${total} passed`,
        );
    }
}

describe("CallbackExtractionNode", () => {
    it("runs all internal unit checks", async () => {
        await runTests();
    });
});
