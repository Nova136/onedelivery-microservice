import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

describe("AppController (guardian-agent)", () => {
    let controller: AppController;

    const mockAppService = {
        processChat: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AppController],
            providers: [{ provide: AppService, useValue: mockAppService }],
        }).compile();

        controller = module.get<AppController>(AppController);
        jest.clearAllMocks();
    });

    describe("handleAgentChat", () => {
        it("calls processChat with correct args and wraps reply", async () => {
            mockAppService.processChat.mockResolvedValue("VERIFIED");

            const payload = { userId: "u1", sessionId: "s1", message: "Verify this..." };
            const result = await controller.handleAgentChat(payload);

            expect(mockAppService.processChat).toHaveBeenCalledWith("u1", "s1", "Verify this...");
            expect(result).toEqual({ reply: "VERIFIED" });
        });

        it("wraps FEEDBACK reply correctly", async () => {
            mockAppService.processChat.mockResolvedValue("FEEDBACK: Refund amount exceeds limit.");

            const payload = { userId: "u1", sessionId: "s1", message: "Verify this..." };
            const result = await controller.handleAgentChat(payload);

            expect(result).toEqual({ reply: "FEEDBACK: Refund amount exceeds limit." });
        });

        it("wraps APPROVED reply correctly", async () => {
            mockAppService.processChat.mockResolvedValue("APPROVED");

            const payload = { userId: "u1", sessionId: "s1", message: "Gate this action: Tool=Execute_Refund..." };
            const result = await controller.handleAgentChat(payload);

            expect(result).toEqual({ reply: "APPROVED" });
        });

        it("wraps BLOCKED reply correctly", async () => {
            mockAppService.processChat.mockResolvedValue("BLOCKED: Policy reference unavailable.");

            const payload = { userId: "u1", sessionId: "s1", message: "Gate this action: Tool=Execute_Refund..." };
            const result = await controller.handleAgentChat(payload);

            expect(result).toEqual({ reply: "BLOCKED: Policy reference unavailable." });
        });
    });
});
