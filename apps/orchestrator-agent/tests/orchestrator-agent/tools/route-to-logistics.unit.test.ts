import { createRouteToLogisticsTool } from "../../../src/orchestrator-agent/tools/route-to-logistics.tool";
import { AgentsClientService } from "../../../src/modules/clients/agents-client/agents-client.service";

describe("RouteToLogisticsTool", () => {
    let mockAgentsClient: jest.Mocked<AgentsClientService>;

    beforeEach(() => {
        mockAgentsClient = {
            send: jest.fn(),
        } as any;
    });

    it("should submit request to Logistics Agent", async () => {
        const tool = createRouteToLogisticsTool(mockAgentsClient);
        const payload = {
            action: "cancel_order" as const,
            userId: "user-123",
            sessionId: "session-456",
            orderId: "order-789",
            description: "Ordered wrong items",
        };

        const result = await tool.invoke(payload);

        expect(result).toBe("Request submitted to Logistics Agent.");
        expect(mockAgentsClient.send).toHaveBeenCalledWith("logistic", {
            userId: "user-123",
            sessionId: "session-456",
            message: JSON.stringify(payload),
        });
    });

    it("should throw error when agents client fails", async () => {
        const tool = createRouteToLogisticsTool(mockAgentsClient);
        mockAgentsClient.send.mockImplementation(() => {
            throw new Error("Connection failed");
        });

        await expect(tool.invoke({
            action: "cancel_order" as const,
            userId: "user-123",
            sessionId: "session-456",
        })).rejects.toThrow("System Error: Logistics Agent unreachable. Connection failed");
    });
});
