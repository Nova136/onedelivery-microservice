import nlp from "compromise";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { Logger, Injectable, OnModuleDestroy } from "@nestjs/common";

@Injectable()
export class PiiRedactionService implements OnModuleDestroy {
    private readonly logger = new Logger(PiiRedactionService.name);
    private redis: Redis | null = null;
    private memoryFallback: Map<string, string> = new Map();

    constructor() {
        try {
            // Use REDIS_URL from environment or fallback to localhost
            this.redis = new Redis(
                process.env.REDIS_URL || "redis://localhost:6379",
                {
                    maxRetriesPerRequest: 1,
                    connectTimeout: 2000,
                    retryStrategy: (times: number) => {
                        if (times > 1) return null; // Stop retrying after 1 attempt
                        return 1000;
                    },
                },
            );

            this.redis.on("error", (err) => {
                this.logger.warn(
                    `Redis connection error, falling back to in-memory storage: ${err.message}`,
                );
                this.redis = null; // Mark as unavailable
            });
        } catch (e) {
            this.logger.warn(
                "Failed to initialize Redis, using in-memory fallback.",
            );
            this.redis = null;
        }
    }

    // Gracefully close the Redis connection when the module/app shuts down
    onModuleDestroy() {
        if (this.redis) {
            this.redis.disconnect();
        }
    }

    /**
     * Redacts both structured PII (Regex) and unstructured entities (NLP).
     * Stores original values in Redis with a token.
     */
    async redact(text: string): Promise<string> {
        if (!text) return text;
        this.logger.log("Scanning message for PII...");

        let redactedText = text;

        // 1. First Pass: Fast Regex for strictly formatted data
        redactedText = await this.redactStructuredData(redactedText);

        // 2. Second Pass: NLP for unstructured entities (Names, Places, Orgs)
        redactedText = await this.redactUnstructuredEntities(redactedText);

        return redactedText;
    }

    /**
     * Retrieves the original value for a given token.
     */
    async retrieve(token: string): Promise<string | null> {
        if (this.redis) {
            try {
                return await this.redis.get(token);
            } catch (e) {
                return this.memoryFallback.get(token) || null;
            }
        }
        return this.memoryFallback.get(token) || null;
    }

    private async storeInRedis(value: string, type: string): Promise<string> {
        const token = `REDACTED_${type}_${uuidv4().slice(0, 8)}`;

        if (this.redis) {
            try {
                // Store with 1 hour expiry (3600 seconds)
                await this.redis.set(token, value, "EX", 3600);
                return token;
            } catch (e) {
                console.warn("Redis write failed, using in-memory fallback.");
                this.redis = null;
            }
        }

        // Fallback to memory
        this.memoryFallback.set(token, value);
        // Basic memory cleanup after 1 hour
        setTimeout(
            () => this.memoryFallback.delete(token),
            3600 * 1000,
        ).unref();

        return token;
    }

    private async redactStructuredData(text: string): Promise<string> {
        let scrubbed = text;

        // Standard Regex patterns
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const creditCardRegex = /\b(?:\d[ -]*?){13,16}\b/g;
        // Supports international (+ or 00), US formats, and Singapore (8 digits starting with 8 or 9)
        // Uses negative lookbehind and lookahead to avoid matching order numbers like FD-0000-000002
        const phoneRegex =
            /(?<![A-Za-z0-9-])(?:(?:\+|00)\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?)?(?:\d[\s.-]?){4,14}\d|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|[89]\d{3}[\s.-]?\d{4})(?![A-Za-z0-9-])/g;

        const replaceAsync = async (
            str: string,
            regex: RegExp,
            type: string,
        ) => {
            const matches = str.match(regex);
            if (!matches) return str;

            let result = str;
            for (const match of Array.from(new Set(matches))) {
                const trimmedMatch = match.trim();
                if (trimmedMatch.length < 5) continue; // Avoid accidental short matches
                const token = await this.storeInRedis(trimmedMatch, type);
                result = result.split(trimmedMatch).join(token);
            }
            return result;
        };

        scrubbed = await replaceAsync(scrubbed, emailRegex, "EMAIL");
        scrubbed = await replaceAsync(scrubbed, creditCardRegex, "CARD");
        scrubbed = await replaceAsync(scrubbed, phoneRegex, "PHONE");

        return scrubbed;
    }

    private async redactUnstructuredEntities(text: string): Promise<string> {
        const doc = nlp(text);
        const people = doc.people().out("array");

        let scrubbed = text;

        const replaceEntities = async (entities: string[], type: string) => {
            const cleanedEntities = entities
                .map((e) => e.replace(/[.,!?;:]+$/, "").trim())
                .filter((e) => e.length > 0);

            const sortedEntities = Array.from(new Set(cleanedEntities)).sort(
                (a, b) => b.length - a.length,
            );
            for (const entity of sortedEntities) {
                const token = await this.storeInRedis(entity, type);
                const regex = new RegExp(
                    `\\b${this.escapeRegExp(entity)}\\b`,
                    "gi",
                );
                scrubbed = scrubbed.replace(regex, token);
            }
        };

        await replaceEntities(people, "NAME");

        return scrubbed;
    }

    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
