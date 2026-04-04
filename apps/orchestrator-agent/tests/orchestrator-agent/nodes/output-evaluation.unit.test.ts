import { createOutputEvaluationNode } from "../../../src/orchestrator-agent/nodes/output-evaluation.node";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

async function runTests() {
    console.log("--- STARTING OUTPUT EVALUATION NODE UNIT TESTS ---\n");
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
        evaluateOutput: async (output: string) => ({
            isSafe: !output.includes("unsafe"),
            biasDetected: false,
        }),
    };

    const mockPromptShield = {
        wrapUntrustedData: (_name: string, data: string) => data,
    };

    const mockAuditService = {
        log: async () => {},
    };

    const deps = {
        outputEvaluator: mockOutputEvaluator as any,
        promptShield: mockPromptShield as any,
        auditService: mockAuditService as any,
    };

    const outputEvaluationNode = createOutputEvaluationNode(deps);

    await test("Evaluate safe output", async () => {
        const state: any = {
            messages: [new HumanMessage("hello"), new AIMessage("safe output")],
            session_id: "test",
            summary: "test",
            order_states: {},
            retrieved_context: [],
        };
        const result = await outputEvaluationNode(state);
        if (result.last_evaluation.isSafe !== true)
            throw new Error("Expected safe");
    });

    await test("Evaluate unsafe output", async () => {
        const state: any = {
            messages: [
                new HumanMessage("hello"),
                new AIMessage("unsafe output"),
            ],
            session_id: "test",
            summary: "test",
            order_states: {},
            retrieved_context: [],
        };
        const result = await outputEvaluationNode(state);
        if (result.last_evaluation.isSafe !== false)
            throw new Error("Expected unsafe");
    });

    if (passed !== total) {
        throw new Error(
            `OUTPUT EVALUATION NODE UNIT TESTS FAILED: ${passed}/${total} passed`,
        );
    }
}

describe("OutputEvaluationNode", () => {
    it("runs all internal unit checks", async () => {
        await runTests();
    });
});
