import { createAggregationNode } from "../../../src/orchestrator-agent/nodes/aggregation.node";
import { HumanMessage } from "@langchain/core/messages";

describe("AggregationNode", () => {
    const mockLlm = {
        withStructuredOutput: () => ({
            withFallbacks: () => ({
                invoke: async () => ({
                    thought: "test",
                    final_response: "Aggregated response",
                }),
            }),
        }),
    };

    const deps = {
        llm: mockLlm as any,
        llmFallback: mockLlm as any,
    };

    const aggregationNode = createAggregationNode(deps);

    it("should aggregate partial responses", async () => {
        const state: any = {
            messages: [new HumanMessage("hello")],
            session_id: "test",
            partial_responses: ["Response 1", "Response 2"],
            order_states: {},
            remaining_intents: [],
        };
        const result = await aggregationNode(state);
        expect(result.messages[0].content).toBe("Aggregated response");
    });

    it("should provide fallback message when no partials", async () => {
        const state: any = {
            messages: [new HumanMessage("hello")],
            session_id: "test",
            partial_responses: [],
            order_states: {},
            remaining_intents: [],
        };
        const result = await aggregationNode(state);
        expect(result.messages[0].content).toContain("I'm sorry");
    });

    it("should append confirmation request for truncated intents", async () => {
        const state: any = {
            messages: [new HumanMessage("hello")],
            session_id: "test",
            partial_responses: ["Response 1"],
            order_states: {},
            remaining_intents: [{ intent: "REFUND", query: "refund me" }],
            has_truncated_intents: true,
        };
        const result = await aggregationNode(state);
        expect(result.messages[0].content).toContain(
            "Would you like to proceed",
        );
        expect(result.is_awaiting_confirmation).toBe(true);
    });
});
