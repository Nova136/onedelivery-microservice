import { createEndChatSessionTool } from "../../../src/orchestrator-agent/tools/end-chat-session.tool";
import { AgentsClientService } from "../../../src/modules/clients/agents-client/agents-client.service";
import { MemoryClientService } from "../../../src/modules/clients/memory-client/memory-client.service";

describe("EndChatSessionTool", () => {
    let mockAgentsClient: jest.Mocked<AgentsClientService>;
    let mockMemoryService: jest.Mocked<MemoryClientService>;

    beforeEach(() => {
        mockAgentsClient = {
            send: jest.fn().mockResolvedValue(undefined),
        } as any;
        mockMemoryService = {
            endChatSession: jest.fn().mockResolvedValue(undefined),
        } as any;
    });

    it("should end chat session and notify QA agent", async () => {
        const tool = createEndChatSessionTool(mockAgentsClient, mockMemoryService);
        const payload = {
            userId: "user-123",
            sessionId: "session-456",
        };

        const result = await tool.invoke(payload);

        expect(result).toContain("Successfully ended the chat session");
        expect(mockMemoryService.endChatSession).toHaveBeenCalledWith("user-123", "session-456");
        expect(mockAgentsClient.send).toHaveBeenCalledWith("qa", {
            userId: "user-123",
            sessionId: "session-456",
            message: "Route to QA Agent for session review",
        });
    });

    it("should return fallback message when memory service fails", async () => {
        const tool = createEndChatSessionTool(mockAgentsClient, mockMemoryService);
        mockMemoryService.endChatSession.mockRejectedValue(new Error("DB Error"));

        const result = await tool.invoke({
            userId: "user-123",
            sessionId: "session-456",
        });

        expect(result).toContain("Internal notification: QA logging failed");
    });
});
