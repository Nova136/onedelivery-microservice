import { getSlidingWindowMessages } from "../../../src/orchestrator-agent/utils/message-window";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

describe("Message Window Utils", () => {
    it("should return empty array for empty input", () => {
        const result = getSlidingWindowMessages([]);
        expect(result).toHaveLength(0);
    });

    it("should return single turn correctly", () => {
        const messages = [new HumanMessage("hi"), new AIMessage("hello")];
        const result = getSlidingWindowMessages(messages, 1);
        expect(result).toHaveLength(2);
    });

    it("should return multiple turns correctly", () => {
        const messages = [
            new HumanMessage("hi"), new AIMessage("hello"),
            new HumanMessage("how are you?"), new AIMessage("good"),
            new HumanMessage("what is your name?"), new AIMessage("AI")
        ];
        const result = getSlidingWindowMessages(messages, 2);
        expect(result).toHaveLength(4);
        expect(result[0].content).toBe("how are you?");
    });

    it("should handle partial turn at end correctly", () => {
        const messages = [
            new HumanMessage("hi"), new AIMessage("hello"),
            new HumanMessage("how are you?")
        ];
        const result = getSlidingWindowMessages(messages, 1);
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe("how are you?");
    });
});
