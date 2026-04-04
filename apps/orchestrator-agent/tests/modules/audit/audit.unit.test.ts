import { AuditService } from "../../../src/modules/audit/audit.service";
import { Logger } from "@nestjs/common";

describe("AuditService", () => {
    let service: AuditService;

    beforeEach(() => {
        service = new AuditService();
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should log structured JSON to console correctly", async () => {
        const entry = {
            session_id: "session1",
            node: "test_node",
            action: "test_action",
            input: { data: "input" },
            output: { data: "output" }
        };

        await service.log(entry);
        
        expect(Logger.prototype.log).toHaveBeenCalled();
        const lastCall = (Logger.prototype.log as jest.Mock).mock.calls[0][0];

        expect(lastCall.session_id).toBe("session1");
        expect(lastCall.node).toBe("test_node");
        expect(lastCall.log_type).toBe("AUDIT_EVENT");
        expect(lastCall.timestamp).toBeDefined();
    });
});
