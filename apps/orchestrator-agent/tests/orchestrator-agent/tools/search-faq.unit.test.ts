import { createSearchFaqTool } from "../../../src/orchestrator-agent/tools/search-faq.tool";
import { KnowledgeClientService } from "../../../src/modules/clients/knowledge-client/knowledge-client.service";

describe("SearchFaqTool", () => {
    let mockKnowledgeClient: jest.Mocked<KnowledgeClientService>;

    beforeEach(() => {
        mockKnowledgeClient = {
            searchFaq: jest.fn(),
        } as any;
    });

    it("should return formatted FAQ when found", async () => {
        const tool = createSearchFaqTool(mockKnowledgeClient);
        const mockFaq = [
            { title: "Delivery Hours", content: "We deliver from 8 AM to 10 PM." },
        ];
        mockKnowledgeClient.searchFaq.mockResolvedValue(mockFaq as any);

        const result = await tool.invoke({ query: "What are the delivery hours?" });

        expect(result).toContain("### SEARCH RESULTS ###");
        expect(result).toContain("Question: Delivery Hours");
        expect(result).toContain("Answer: We deliver from 8 AM to 10 PM.");
    });

    it("should return error message when FAQ not found", async () => {
        const tool = createSearchFaqTool(mockKnowledgeClient);
        mockKnowledgeClient.searchFaq.mockResolvedValue([] as any);

        const result = await tool.invoke({ query: "UNKNOWN" });

        expect(result).toContain("No relevant FAQ found");
        expect(result).toContain("I'm sorry, I don't have the answer to that specific question.");
    });

    it("should throw error when knowledge client fails", async () => {
        const tool = createSearchFaqTool(mockKnowledgeClient);
        mockKnowledgeClient.searchFaq.mockRejectedValue(new Error("Network Error"));

        await expect(tool.invoke({ query: "REFUND" })).rejects.toThrow("System Error: Knowledge Microservice unreachable. Network Error");
    });
});
