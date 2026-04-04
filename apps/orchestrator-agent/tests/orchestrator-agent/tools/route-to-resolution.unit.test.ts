import { createRouteToResolutionTool } from "../../../src/orchestrator-agent/tools/route-to-resolution.tool";
import { AgentsClientService } from "../../../src/modules/clients/agents-client/agents-client.service";

describe("RouteToResolutionTool", () => {
    let mockAgentsClient: jest.Mocked<AgentsClientService>;

    beforeEach(() => {
        mockAgentsClient = {
            send: jest.fn(),
        } as any;
    });

    it("should submit request to Resolution Agent", async () => {
        const tool = createRouteToResolutionTool(mockAgentsClient);
        const payload = {
            action: "request_refund" as const,
            userId: "user-123",
            sessionId: "session-456",
            orderId: "order-789",
            issueIntent: "missing_item" as const,
            description: "Pizza was missing",
            items: [{ name: "Pizza", quantity: 1 }],
        };

        const result = await tool.invoke(payload);

        expect(result).toBe("Request submitted to Resolution Agent.");
        expect(mockAgentsClient.send).toHaveBeenCalledWith("resolution", {
            userId: "user-123",
            sessionId: "session-456",
            message: JSON.stringify(payload),
        });
    });

    it("should throw error when agents client fails", async () => {
        const tool = createRouteToResolutionTool(mockAgentsClient);
        mockAgentsClient.send.mockImplementation(() => {
            throw new Error("Connection failed");
        });

        await expect(tool.invoke({
            action: "request_refund" as const,
            userId: "user-123",
            sessionId: "session-456",
        })).rejects.toThrow("System Error: Resolution Agent unreachable. Connection failed");
    });
});
