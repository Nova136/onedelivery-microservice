import { MemoryClientService } from "../../../../src/modules/clients/memory-client/memory-client.service";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

describe("MemoryClientService", () => {
    let service: MemoryClientService;
    let mockCommonService: any;
    let mockClientProxy: any;
    let lastPayload: any = null;

    beforeEach(() => {
        lastPayload = null;
        mockCommonService = {
            sendViaRMQ: jest
                .fn()
                .mockImplementation((_proxy, _cmd, payload) => {
                    lastPayload = payload;
                    return Promise.resolve();
                }),
        };
        mockClientProxy = {};
        service = new MemoryClientService(
            mockClientProxy as any,
            mockCommonService as any,
        );
    });

    it("should save HumanMessage correctly", async () => {
        await service.saveHistory(
            "user1",
            "session1",
            1,
            new HumanMessage("Hello"),
        );
        expect(lastPayload.message.type).toBe("human");
        expect(lastPayload.message.content).toBe("Hello");
    });

    it("should save AIMessage correctly", async () => {
        await service.saveHistory(
            "user1",
            "session1",
            2,
            new AIMessage("Hi there"),
        );
        expect(lastPayload.message.type).toBe("ai");
        expect(lastPayload.message.content).toBe("Hi there");
    });

    it("should save ToolMessage correctly", async () => {
        await service.saveHistory(
            "user1",
            "session1",
            3,
            new ToolMessage({ content: "Tool result", tool_call_id: "tool1" }),
        );
        expect(lastPayload.message.type).toBe("tool");
        expect(lastPayload.message.toolCallId).toBe("tool1");
    });

    it("should escalate session correctly", async () => {
        await service.escalateSession("user1", "session1");
        expect(lastPayload.userId).toBe("user1");
        expect(lastPayload.sessionId).toBe("session1");
    });
});
