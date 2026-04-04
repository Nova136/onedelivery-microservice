import { KnowledgeClientService } from "../../../../src/modules/clients/knowledge-client/knowledge-client.service";
import { of } from "rxjs";

describe("KnowledgeClientService", () => {
    let service: KnowledgeClientService;
    let mockKnowledgeClient: any;
    let lastCmd: string | null = null;
    let lastPayload: any = null;

    beforeEach(() => {
        lastCmd = null;
        lastPayload = null;
        mockKnowledgeClient = {
            send: jest.fn().mockImplementation((cmd: string, payload: any) => {
                lastCmd = cmd;
                lastPayload = payload;
                if (cmd === "faq") return of([{ title: "FAQ Title", content: "FAQ Content" }]);
                if (cmd === "sop") return of({ intentCode: "SOP_CODE", title: "SOP Title" });
                if (cmd === "sop.list") return of([{ intentCode: "SOP1", title: "SOP 1" }]);
                return of(null);
            }),
        };
        service = new KnowledgeClientService(mockKnowledgeClient as any);
    });

    it("should search FAQ correctly", async () => {
        const faqRes = await service.searchFaq({ query: "delivery fee" });
        expect(lastCmd).toBe("faq");
        expect(lastPayload.query).toBe("delivery fee");
        expect(faqRes.length).toBeGreaterThan(0);
    });

    it("should search internal SOP correctly", async () => {
        const sopRes = await service.searchInternalSop({ intentCode: "REFUND", requestingAgent: "orchestrator" });
        expect(lastCmd).toBe("sop");
        expect(lastPayload.intentCode).toBe("REFUND");
        expect(sopRes.intentCode).toBe("SOP_CODE");
    });

    it("should list orchestrator SOPs correctly", async () => {
        const listRes = await service.listOrchestratorSops();
        expect(lastCmd).toBe("sop.list");
        expect(lastPayload.requestingAgent).toBe("orchestrator");
        expect(listRes.length).toBeGreaterThan(0);
    });
});
