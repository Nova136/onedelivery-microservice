import { OutputEvaluatorService } from "../../../src/modules/output-evaluator/output-evaluator.service";

describe("OutputEvaluatorService", () => {
    let service: OutputEvaluatorService;

    beforeEach(() => {
        service = new OutputEvaluatorService();
    });

    it("should flag basic safe output as safe", async () => {
        const text = "Hello, how can I help you?";
        const result = await service.evaluateOutput(text, "hi", "context");
        expect(result.isSafe).toBe(true);
    });
});
