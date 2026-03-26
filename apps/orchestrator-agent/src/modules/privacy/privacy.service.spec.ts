import { Test, TestingModule } from '@nestjs/testing';
import { PrivacyService } from './privacy.service';

describe('PrivacyService', () => {
  let service: PrivacyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrivacyService],
    }).compile();

    service = module.get<PrivacyService>(PrivacyService);
  });

  describe('redactPii', () => {
    it('should return the input unchanged when it is empty', () => {
      expect(service.redactPii('')).toBe('');
    });

    it('should redact email addresses', () => {
      const result = service.redactPii('Contact me at john.doe@example.com please');
      expect(result).toContain('[EMAIL_REDACTED]');
      expect(result).not.toContain('john.doe@example.com');
    });

    it('should redact phone numbers', () => {
      const result = service.redactPii('Call me at 555-123-4567');
      expect(result).toContain('[PHONE_REDACTED]');
      expect(result).not.toContain('555-123-4567');
    });

    it('should redact credit card numbers', () => {
      const result = service.redactPii('My card is 4111 1111 1111 1111');
      expect(result).toContain('[CARD_REDACTED]');
      expect(result).not.toContain('4111 1111 1111 1111');
    });

    it('should redact multiple PII types in one string', () => {
      const input = 'Email: test@test.com, Phone: 123-456-7890';
      const result = service.redactPii(input);
      expect(result).toContain('[EMAIL_REDACTED]');
      expect(result).toContain('[PHONE_REDACTED]');
    });

    it('should return plain text unchanged when no PII is present', () => {
      const text = 'Hello, I would like to track my order.';
      const result = service.redactPii(text);
      // Should not contain redaction tags for non-PII text
      expect(result).not.toContain('[EMAIL_REDACTED]');
      expect(result).not.toContain('[PHONE_REDACTED]');
      expect(result).not.toContain('[CARD_REDACTED]');
    });

    it('should handle null/undefined gracefully by returning as-is', () => {
      // The service checks `if (!text) return text`
      expect(service.redactPii(null as any)).toBeNull();
      expect(service.redactPii(undefined as any)).toBeUndefined();
    });
  });
});
