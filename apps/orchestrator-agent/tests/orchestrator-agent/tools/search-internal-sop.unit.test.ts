import { createSearchInternalSopTool } from "../../../src/orchestrator-agent/tools/search-internal-sop.tool";
import { KnowledgeClientService } from "../../../src/modules/clients/knowledge-client/knowledge-client.service";

describe("SearchInternalSopTool", () => {
    let mockKnowledgeClient: jest.Mocked<KnowledgeClientService>;

    beforeEach(() => {
        mockKnowledgeClient = {
            searchInternalSop: jest.fn(),
        } as any;
    });

    it("should return formatted SOP when found", async () => {
        const tool = createSearchInternalSopTool(mockKnowledgeClient);
        const mockSop = {
            title: "Refund Policy",
            requiredData: [{ name: "orderId", type: "string", description: "The ID of the order" }],
            workflowSteps: ["Step 1: Check order status", "Step 2: Process refund"],
            permittedTools: ["process-refund"],
        };
        mockKnowledgeClient.searchInternalSop.mockResolvedValue(mockSop as any);

        const result = await tool.invoke({ intentCode: "REFUND" });

        expect(result).toContain("### INTERNAL RULEBOOK: Refund Policy ###");
        expect(result).toContain("- orderId (string): The ID of the order");
        expect(result).toContain("Step 1: Check order status");
        expect(result).toContain("process-refund");
    });

    it("should return error message when SOP not found", async () => {
        const tool = createSearchInternalSopTool(mockKnowledgeClient);
        mockKnowledgeClient.searchInternalSop.mockResolvedValue(null as any);

        const result = await tool.invoke({ intentCode: "UNKNOWN" });

        expect(result).toContain("Error: No internal rules found for intent 'UNKNOWN'");
    });

    it("should throw error when knowledge client fails", async () => {
        const tool = createSearchInternalSopTool(mockKnowledgeClient);
        mockKnowledgeClient.searchInternalSop.mockRejectedValue(new Error("Network Error"));

        await expect(tool.invoke({ intentCode: "REFUND" })).rejects.toThrow("System Error: Knowledge Microservice unreachable. Network Error");
    });
});
