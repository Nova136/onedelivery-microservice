import { InputValidatorService } from "../../../src/modules/input-validator/input-validator.service";

describe("InputValidatorService", () => {
    let service: InputValidatorService;

    beforeEach(() => {
        service = new InputValidatorService();
    });

    it("should flag control characters as invalid", async () => {
        const text = "hi\u0000there";
        const result = await service.validateMessage(text);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Security Threat Detected: Malformed Input");
    });

    it("should flag excessive repetition as invalid", async () => {
        const text = "a".repeat(21);
        const result = await service.validateMessage(text);
        expect(result.isValid).toBe(false);
    });

    it("should flag spacing bypass as invalid", async () => {
        const text = "j o h n @ e m a i l";
        const result = await service.validateMessage(text);
        expect(result.isValid).toBe(false);
    });

    it("should flag messages that are too long as invalid", async () => {
        const text = "a".repeat(301);
        const result = await service.validateMessage(text);
        expect(result.isValid).toBe(false);
    });

    it("should flag empty messages as invalid", async () => {
        const result = await service.validateMessage("");
        expect(result.isValid).toBe(false);
    });
});
