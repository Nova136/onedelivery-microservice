import { Test, TestingModule } from "@nestjs/testing";
import {
    AgentsClientService,
    AgentName,
} from "../../../../src/modules/clients/agents-client/agents-client.service";
import { ClientProxy } from "@nestjs/microservices";
import { of } from "rxjs";
import { AGENT_CHAT_PATTERN } from "@libs/modules/generic/enum/agent-chat.pattern";

describe("AgentsClientService", () => {
    let service: AgentsClientService;
    let mockResolutionClient: jest.Mocked<ClientProxy>;
    let mockQaClient: jest.Mocked<ClientProxy>;
    let mockGuardianClient: jest.Mocked<ClientProxy>;
    let mockLogisticClient: jest.Mocked<ClientProxy>;

    beforeEach(async () => {
        mockResolutionClient = {
            send: jest.fn(),
            emit: jest.fn(),
        } as any;
        mockQaClient = {
            send: jest.fn(),
            emit: jest.fn(),
        } as any;
        mockGuardianClient = {
            send: jest.fn(),
            emit: jest.fn(),
        } as any;
        mockLogisticClient = {
            send: jest.fn(),
            emit: jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AgentsClientService,
                { provide: "RESOLUTION_AGENT", useValue: mockResolutionClient },
                { provide: "QA_AGENT", useValue: mockQaClient },
                { provide: "GUARDIAN_AGENT", useValue: mockGuardianClient },
                { provide: "LOGISTIC_AGENT", useValue: mockLogisticClient },
            ],
        }).compile();

        service = module.get<AgentsClientService>(AgentsClientService);
    });

    it("should send message to resolution agent", async () => {
        const payload = { userId: "u1", sessionId: "s1", message: "hi" };
        mockResolutionClient.send.mockReturnValue(of({ reply: "hello" }));

        const result = await service.send("resolution", payload);

        expect(result).toBe("hello");
        expect(mockResolutionClient.send).toHaveBeenCalledWith(
            AGENT_CHAT_PATTERN,
            payload,
        );
    });

    it("should send message to qa agent", async () => {
        const payload = { userId: "u1", sessionId: "s1", message: "hi" };
        mockQaClient.send.mockReturnValue(of({ reply: "reviewed" }));

        const result = await service.send("qa", payload);

        expect(result).toBe("reviewed");
        expect(mockQaClient.send).toHaveBeenCalledWith(
            AGENT_CHAT_PATTERN,
            payload,
        );
    });

    it("should send message to guardian agent", async () => {
        const payload = { userId: "u1", sessionId: "s1", message: "hi" };
        mockGuardianClient.send.mockReturnValue(of({ reply: "verified" }));

        const result = await service.send("guardian", payload);

        expect(result).toBe("verified");
        expect(mockGuardianClient.send).toHaveBeenCalledWith(
            AGENT_CHAT_PATTERN,
            payload,
        );
    });

    it("should throw error for unknown agent", async () => {
        const payload = { userId: "u1", sessionId: "s1", message: "hi" };

        await expect(
            service.send("unknown" as AgentName, payload),
        ).rejects.toThrow("Unknown agent: unknown");
    });
});
