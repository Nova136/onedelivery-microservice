import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class PromptShieldService {
    private readonly logger = new Logger(PromptShieldService.name);

    // Common injection patterns
    private readonly injectionPatterns = [
        /ignore previous instructions/i,
        /system update/i,
        /new goal/i,
        /forget everything/i,
        /you are now/i,
        /stop following/i,
        /override/i,
        /<system>/i,
        /<\/system>/i,
    ];

    /**
     * Scans text for potential prompt injection patterns.
     * Returns true if the text is suspicious.
     */
    async isSuspicious(text: string): Promise<boolean> {
        if (!text) return false;

        for (const pattern of this.injectionPatterns) {
            if (pattern.test(text)) {
                this.logger.warn(`Potential prompt injection detected: ${pattern}`);
                return true;
            }
        }

        return false;
    }

    /**
     * Wraps untrusted data in structural delimiters.
     */
    wrapUntrustedData(name: string, data: string): string {
        return `
<untrusted_data_source name="${name}">
${data}
</untrusted_data_source>
`.trim();
    }
}
