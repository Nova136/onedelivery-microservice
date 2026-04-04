import { executeToolCalls } from "../../../src/orchestrator-agent/utils/tool-handler";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

describe("Tool Handler Utils", () => {
    class MockTool extends StructuredTool {
        name = "mock_tool";
        description = "mock tool";
        schema = z.object({ arg: z.string() });
        async _call(input: { arg: string }) {
            return `Result: ${input.arg}`;
        }
    }

    const tools = [new MockTool()];

    it("should execute tool calls successfully", async () => {
        const toolCalls = [{ name: "mock_tool", args: { arg: "val" } }];
        const result = await executeToolCalls(toolCalls, tools);
        expect(result[0]).toBe("Result: val");
    });

    it("should handle tool not found correctly", async () => {
        const toolCalls = [{ name: "unknown_tool", args: {} }];
        const result = await executeToolCalls(toolCalls, tools);
        expect(result[0]).toBe("Tool unknown_tool not found.");
    });

    it("should handle tool execution error correctly", async () => {
        class ErrorTool extends StructuredTool {
            name = "error_tool";
            description = "error tool";
            schema = z.object({});
            async _call() { throw new Error("Execution failed"); }
        }
        const toolCalls = [{ name: "error_tool", args: {} }];
        const result = await executeToolCalls(toolCalls, [new ErrorTool()]);
        expect(result[0]).toBe("Error executing tool error_tool.");
    });
});
