import { createEscalateToHumanTool } from "../../../src/orchestrator-agent/tools/escalate-to-human.tool";
import { MemoryClientService } from "../../../src/modules/clients/memory-client/memory-client.service";

describe("EscalateToHumanTool", () => {
    let mockMemoryService: jest.Mocked<MemoryClientService>;

    beforeEach(() => {
        mockMemoryService = {
            escalateSession: jest.fn(),
        } as any;
    });

    it("should escalate session", async () => {
        const tool = createEscalateToHumanTool(mockMemoryService);
        const payload = {
            userId: "user-123",
            sessionId: "session-456",
            message: "User is very angry",
        };

        const result = await tool.invoke(payload);

        expect(result).toContain(
            "I'm escalating your case to our support team now",
        );
        expect(mockMemoryService.escalateSession).toHaveBeenCalledWith(
            "user-123",
            "session-456",
        );
    });

    it("should return fallback message when memory service fails", async () => {
        const tool = createEscalateToHumanTool(mockMemoryService);
        mockMemoryService.escalateSession.mockRejectedValue(
            new Error("DB Error"),
        );

        const result = await tool.invoke({
            userId: "user-123",
            sessionId: "session-456",
            message: "Help",
        });

        expect(result).toContain(
            "I'm trying to connect you with a human agent, but we are experiencing technical difficulties",
        );
    });
});
