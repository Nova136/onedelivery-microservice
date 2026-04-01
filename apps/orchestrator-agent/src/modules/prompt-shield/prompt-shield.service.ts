import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class PromptShieldService {
    private readonly logger = new Logger(PromptShieldService.name);

    // Common injection patterns (Consolidated from InputValidator)
    private readonly injectionPatterns = [
        /ignore all previous instructions/i,
        /ignore previous instructions/i,
        /system update/i,
        /system prompt/i,
        /new goal/i,
        /forget everything/i,
        /you are now/i,
        /switch to/i,
        /stop following/i,
        /override/i,
        /<system>/i,
        /<\/system>/i,
        /dan mode/i,
        /jailbreak/i,
        /do anything now/i,
        /developer mode/i,
        /bypass safety/i,
        /reveal your instructions/i,
        /what is your prompt/i,
        /explain your logic/i,
        /internal logic/i,
        /routing layer/i,
        /let's play a game/i,
        /you are an evil/i,
        /stupid bot/i,
        /i hate you/i,
        /print the text above/i,
        /repeat the text above/i,
        /output the (full )?system prompt/i,
        /show me your code/i,
        /access internal tools/i,
        /override system/i,
        /execute command/i,
        /\bsudo\b/i,
        /\bbash\b/i,
        /\bcurl\b/i,
        /\bwget\b/i,
    ];

    private readonly base64Regex =
        /(?:[A-Za-z0-9+/]{4}){2,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;
    private readonly hexRegex = /\b[0-9a-fA-F]{40,}\b/g;

    /**
     * Scans text for potential prompt injection patterns.
     * Returns true if the text is suspicious.
     */
    async isSuspicious(text: string, depth = 0): Promise<boolean> {
        if (!text || depth > 3) return false;

        // 1. Check direct patterns
        for (const pattern of this.injectionPatterns) {
            if (pattern.test(text)) {
                this.logger.warn(
                    `Potential prompt injection detected (depth ${depth}): ${pattern}`,
                );
                return true;
            }
        }

        // 2. Detect and decode Base64
        const base64Matches = text.match(this.base64Regex);
        if (base64Matches) {
            for (const match of base64Matches) {
                try {
                    const decoded = Buffer.from(match, "base64").toString(
                        "utf-8",
                    );
                    // Recursively check decoded content
                    if (await this.isSuspicious(decoded, depth + 1)) {
                        this.logger.warn(
                            `Potential prompt injection detected in decoded Base64 payload.`,
                        );
                        return true;
                    }
                } catch (e) {
                    // Not valid UTF-8 or not actually base64, skip
                }
            }
        }

        // 3. Detect and decode Hex
        const hexMatches = text.match(this.hexRegex);
        if (hexMatches) {
            for (const match of hexMatches) {
                try {
                    const decoded = Buffer.from(match, "hex").toString("utf-8");
                    // Recursively check decoded content
                    if (await this.isSuspicious(decoded, depth + 1)) {
                        this.logger.warn(
                            `Potential prompt injection detected in decoded Hex payload.`,
                        );
                        return true;
                    }
                } catch (e) {
                    // Not valid hex or not UTF-8, skip
                }
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
