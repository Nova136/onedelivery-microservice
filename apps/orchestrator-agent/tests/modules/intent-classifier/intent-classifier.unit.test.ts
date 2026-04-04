import { IntentClassifierService } from "../../../src/modules/intent-classifier/intent-classifier.service";
import { HumanMessage } from "@langchain/core/messages";
import { Logger } from "@nestjs/common";

describe("IntentClassifierService", () => {
    let service: IntentClassifierService;
    let mockKnowledgeClient: any;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
        jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
        jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
        jest.spyOn(Logger.prototype, "debug").mockImplementation(() => {});

        mockKnowledgeClient = {
            listOrchestratorSops: jest.fn().mockResolvedValue([
                { intentCode: "REFUND", title: "Refund Request" },
                { intentCode: "CANCEL", title: "Cancel Order" },
            ]),
        };
        service = new IntentClassifierService(mockKnowledgeClient as any);

        // Mock the model's invoke method
        (service as any).model = {
            invoke: jest.fn().mockResolvedValue({
                thought: "The user wants a refund.",
                results: [
                    {
                        intent: "REFUND",
                        query: "I want a refund",
                        confidence: 0.95,
                    },
                ],
            }),
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should classify refund intent correctly", async () => {
        const res = await service.classifyIntents(
            [new HumanMessage("I want a refund")],
            "",
            [],
            "None",
        );
        expect(res.intents).toContain("REFUND");
        expect(res.decomposed[0].intent).toBe("REFUND");
    });

    it("should default to general on LLM failure", async () => {
        (service as any).model.invoke.mockRejectedValue(new Error("LLM Error"));
        const res = await service.classifyIntents(
            [new HumanMessage("Hello")],
            "",
            [],
            "None",
        );
        expect(res.intents).toContain("general");
    });

    it("should route to unclear on low confidence", async () => {
        (service as any).model.invoke.mockResolvedValue({
            thought: "Not sure.",
            results: [
                { intent: "REFUND", query: "maybe refund?", confidence: 0.3 },
            ],
        });
        const res = await service.classifyIntents(
            [new HumanMessage("maybe refund?")],
            "",
            [],
            "None",
        );
        expect(res.intents).toContain("unclear");
    });
});
