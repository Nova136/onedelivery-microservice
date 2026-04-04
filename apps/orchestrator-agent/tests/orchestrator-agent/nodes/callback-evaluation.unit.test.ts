import { createCallbackEvaluationNode } from "../../../src/orchestrator-agent/nodes/callback-evaluation.node";

async function runTests() {
    console.log("--- STARTING CALLBACK EVALUATION NODE UNIT TESTS ---\n");
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

    const mockOutputEvaluator = {
        evaluateAgentUpdate: async (msg: string) => ({
            isSafe: !msg.includes("unsafe"),
            biasDetected: false,
        }),
    };

    const mockAuditService = {
        log: async () => {},
    };

    const deps = {
        outputEvaluator: mockOutputEvaluator as any,
        auditService: mockAuditService as any,
    };

    const callbackEvaluationNode = createCallbackEvaluationNode(deps);

    await test("Evaluate safe callback", async () => {
        const state: any = {
            is_safe: true,
            synthesized_message: "Safe message",
            redacted_message: "Safe message",
            summary: "test",
            session_id: "test",
        };
        const result = await callbackEvaluationNode(state);
        if (result.is_safe !== true) throw new Error("Expected safe");
    });

    await test("Evaluate unsafe callback", async () => {
        const state: any = {
            is_safe: true,
            synthesized_message: "unsafe message",
            redacted_message: "unsafe message",
            summary: "test",
            session_id: "test",
        };
        const result = await callbackEvaluationNode(state);
        if (result.is_safe !== false) throw new Error("Expected unsafe");
    });

    await test("Skip if already unsafe", async () => {
        const state: any = {
            is_safe: false,
            session_id: "test",
        };
        const result = await callbackEvaluationNode(state);
        if (result.is_safe !== false) throw new Error("Expected unsafe");
    });

    if (passed !== total) {
        throw new Error(
            `CALLBACK EVALUATION NODE UNIT TESTS FAILED: ${passed}/${total} passed`,
        );
    }
}

describe("CallbackEvaluationNode", () => {
    it("runs all internal unit checks", async () => {
        await runTests();
    });
});
