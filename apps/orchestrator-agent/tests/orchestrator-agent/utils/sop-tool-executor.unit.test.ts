import { executeSopTool } from "../../../src/orchestrator-agent/utils/sop-tool-executor";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

describe("SOP Tool Executor Utils", () => {
    class MockTool extends StructuredTool {
        name = "mock_tool";
        description = "mock tool";
        schema = z.object({ arg: z.string() });
        async _call(input: { arg: string }) {
            return `Result: ${input.arg}`;
        }
    }

    const tool = new MockTool();

    it("should execute SOP tool successfully", async () => {
        const agentOutput = { requested_tool: { name: "mock_tool", args: JSON.stringify({ arg: "val" }) } };
        const state: any = { user_id: "user1", session_id: "session1", user_orders: [] };
        const result = await executeSopTool(tool, agentOutput, state, "intent1", {});
        expect(result.success).toBe(true);
        expect(result.messages[0].content).toContain("SYSTEM_ACTION: Tool mock_tool executed successfully");
    });

    it("should prevent confused deputy attacks", async () => {
        const agentOutput = { requested_tool: { name: "mock_tool", args: JSON.stringify({ orderId: "999" }) } };
        const state: any = { user_id: "user1", session_id: "session1", user_orders: [{ orderId: "123" }] };
        const result = await executeSopTool(tool, agentOutput, state, "intent1", {});
        expect(result.success).toBe(false);
        expect(result.partial_responses![0]).toContain("couldn't find that order");
    });

    it("should handle tool execution error correctly", async () => {
        class ErrorTool extends StructuredTool {
            name = "error_tool";
            description = "error tool";
            schema = z.object({});
            async _call() { throw new Error("Execution failed"); }
        }
        const agentOutput = { requested_tool: { name: "error_tool", args: "{}" } };
        const state: any = { user_id: "user1", session_id: "session1", user_orders: [] };
        const result = await executeSopTool(new ErrorTool(), agentOutput, state, "intent1", {});
        expect(result.success).toBe(false);
        expect(result.finalResponse).toContain("SYSTEM: Apologize for a system fault");
    });
});
