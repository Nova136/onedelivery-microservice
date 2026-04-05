import { PiiRedactionService } from "../../../src/modules/pii-redaction/pii-redaction.service";
import { Logger } from "@nestjs/common";

jest.mock("ioredis", () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => {
            throw new Error(
                "Simulated Redis connection error to force local memory fallback",
            );
        }),
    };
});

describe("PiiRedactionService", () => {
    let service: PiiRedactionService;

    beforeEach(() => {
        // Specific mock for setTimeout to avoid open handles without freezing async/await
        jest.spyOn(global, "setTimeout").mockReturnValue({
            unref: jest.fn(),
        } as any);
        jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
        jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
        service = new PiiRedactionService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should redact email correctly", async () => {
        const text = "Contact me at test@example.com";
        const redacted = await service.redact(text);
        expect(redacted).toContain("REDACTED_EMAIL_");
        expect(redacted).not.toContain("test@example.com");
    });

    it("should redact phone correctly", async () => {
        const text = "Call 555-123-4567";
        const redacted = await service.redact(text);
        expect(redacted).toContain("REDACTED_PHONE_");
        expect(redacted).not.toContain("555-123-4567");
    });

    it("should redact credit card correctly", async () => {
        const text = "My card is 1234-5678-9012-3456";
        const redacted = await service.redact(text);
        expect(redacted).toContain("REDACTED_CARD_");
        expect(redacted).not.toContain("1234-5678-9012-3456");
    });

    it("should redact name correctly", async () => {
        const text = "My name is John Doe";
        const redacted = await service.redact(text);
        expect(redacted).toContain("REDACTED_NAME_");
        expect(redacted).not.toContain("John Doe");
    });

    it("should retrieve original value correctly", async () => {
        const text = "Contact test@example.com";
        const redacted = await service.redact(text);
        const token = redacted.split(" ").pop()!;
        const original = await service.retrieve(token);
        expect(original).toBe("test@example.com");
    });
});
