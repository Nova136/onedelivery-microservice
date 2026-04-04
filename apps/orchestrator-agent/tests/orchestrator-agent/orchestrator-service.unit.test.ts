import { OrchestratorService } from "../../src/orchestrator-agent/orchestrator.service";
import { AIMessage } from "@langchain/core/messages";

describe("OrchestratorService", () => {
    let service: OrchestratorService;
    let mockGraph: any;
    let mockCallbackGraph: any;
    let mockMemoryService: any;
    let mockPiiService: any;
    let mockPromptShield: any;
    let mockInputValidator: any;
    let mockSummarizer: any;

    beforeEach(() => {
        mockGraph = {
            invoke: jest
                .fn()
                .mockResolvedValue({
                    messages: [new AIMessage("AI response")],
                }),
            getState: jest
                .fn()
                .mockResolvedValue({ values: { summary: "summary" } }),
            updateState: jest.fn().mockResolvedValue(undefined),
        };
        mockCallbackGraph = {
            invoke: jest
                .fn()
                .mockResolvedValue({
                    is_safe: true,
                    synthesized_message: "Safe message",
                }),
        };
        mockMemoryService = {
            getChatHistory: jest
                .fn()
                .mockResolvedValue({
                    id: "session1",
                    status: "active",
                    messages: [],
                }),
            saveHistory: jest.fn().mockResolvedValue(undefined),
            updateSessionSummary: jest.fn().mockResolvedValue(undefined),
        };
        mockPiiService = {
            redact: jest.fn().mockImplementation((msg) => Promise.resolve(msg)),
        };
        mockPromptShield = {
            isSuspicious: jest.fn().mockResolvedValue(false),
        };
        mockInputValidator = {
            validateMessage: jest.fn().mockResolvedValue({ isValid: true }),
        };
        mockSummarizer = {
            summarize: jest.fn().mockResolvedValue("summary"),
        };

        service = new OrchestratorService(
            mockGraph as any,
            mockCallbackGraph as any,
            mockMemoryService as any,
            mockPiiService as any,
            mockPromptShield as any,
            mockInputValidator as any,
            mockSummarizer as any,
        );
    });

    it("should bypass closed session", async () => {
        mockMemoryService.getChatHistory.mockResolvedValue({
            id: "session1",
            status: "closed",
            messages: [],
            summary: "old summary",
        });
        const res = await service.processHumanInput(
            "user1",
            "session1",
            "Hello",
        );
        expect(res.response).toBeNull();
        expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it("should block suspicious input", async () => {
        mockPromptShield.isSuspicious.mockResolvedValue(true);
        const res = await service.processHumanInput(
            "user1",
            "session1",
            "Suspicious",
        );
        expect(res.response).toContain("I'm sorry");
        expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it("should process normal chat correctly", async () => {
        const res = await service.processHumanInput(
            "user1",
            "session1",
            "Where is my order?",
        );
        expect(res.response).toBe("AI response");
        expect(mockGraph.invoke).toHaveBeenCalled();
    });

    it("should handle unsafe callback fallback correctly", async () => {
        mockCallbackGraph.invoke.mockResolvedValue({
            is_safe: false,
            synthesized_message: "Unsafe",
        });
        const res = await service.processAgentCallback(
            "session1",
            "user1",
            "Status: Rejected. Reason: Fraud.",
        );
        expect(res.messageContent).toContain("Your request has been rejected");
    });
});
