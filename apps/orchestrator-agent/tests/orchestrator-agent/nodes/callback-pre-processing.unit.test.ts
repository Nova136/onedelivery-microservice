import { createCallbackPreProcessingNode } from "../../../src/orchestrator-agent/nodes/callback-pre-processing.node";

async function runTests() {
    console.log("--- STARTING CALLBACK PRE-PROCESSING NODE UNIT TESTS ---\n");
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

    const mockPiiService = {
        redact: async (msg: string) => msg.replace("John", "[REDACTED]"),
    };

    const mockPromptShield = {
        isSuspicious: async (msg: string) => msg.includes("malicious"),
        wrapUntrustedData: (_name: string, data: string) =>
            `<untrusted>${data}</untrusted>`,
    };

    const deps = {
        piiService: mockPiiService as any,
        promptShield: mockPromptShield as any,
    };

    const callbackPreProcessingNode = createCallbackPreProcessingNode(deps);

    await test("Redact PII in callback", async () => {
        const state: any = { agent_message: "Hello John" };
        const result = await callbackPreProcessingNode(state);
        if (result.redacted_message !== "Hello [REDACTED]")
            throw new Error("Expected redaction");
        if (result.is_safe !== true) throw new Error("Expected safe");
    });

    await test("Detect suspicious callback", async () => {
        const state: any = { agent_message: "This is malicious" };
        const result = await callbackPreProcessingNode(state);
        if (!result.redacted_message.includes("<untrusted>"))
            throw new Error("Expected untrusted wrap");
        if (result.is_safe !== false) throw new Error("Expected unsafe");
    });

    if (passed !== total) {
        throw new Error(
            `CALLBACK PRE-PROCESSING NODE UNIT TESTS FAILED: ${passed}/${total} passed`,
        );
    }
}

describe("CallbackPreProcessingNode", () => {
    it("runs all internal unit checks", async () => {
        await runTests();
    });
});
