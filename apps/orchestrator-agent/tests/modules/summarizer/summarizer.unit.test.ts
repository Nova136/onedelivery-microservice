import { SummarizerService } from "../../../src/modules/summarizer/summarizer.service";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

describe("SummarizerService", () => {
    let service: SummarizerService;

    beforeEach(() => {
        service = new SummarizerService();
    });

    it("should return a string summary", async () => {
        const messages = [new HumanMessage("hi"), new AIMessage("hello")];
        const result = await service.summarize(messages, "Previous summary", "track_order");
        expect(typeof result).toBe("string");
    });
});
