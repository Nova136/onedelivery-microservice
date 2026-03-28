import nlp from "compromise";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { Logger, Injectable } from "@nestjs/common";

@Injectable()
export class PiiRedactionService {
    private readonly logger = new Logger(PiiRedactionService.name);
    private redis: Redis | null = null;
    private memoryFallback: Map<string, string> = new Map();

    constructor() {
        try {
            // Use REDIS_URL from environment or fallback to localhost
            this.redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
                maxRetriesPerRequest: 1,
                connectTimeout: 2000,
                retryStrategy: (times) => {
                    if (times > 1) return null; // Stop retrying after 1 attempt
                    return 1000;
                }
            });

            this.redis.on("error", (err) => {
                this.logger.warn(`Redis connection error, falling back to in-memory storage: ${err.message}`);
                this.redis = null; // Mark as unavailable
            });
        } catch (e) {
            this.logger.warn("Failed to initialize Redis, using in-memory fallback.");
            this.redis = null;
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
        setTimeout(() => this.memoryFallback.delete(token), 3600 * 1000);
        
        return token;
    }

    private async redactStructuredData(text: string): Promise<string> {
        let scrubbed = text;

        // Standard Regex patterns
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const phoneRegex = /(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?/g;
        const creditCardRegex = /\b(?:\d[ -]*?){13,16}\b/g;
        // Simple address regex for "precise location" (e.g., "123 Main St")
        const addressRegex = /\b\d+\s+[A-Za-z0-9\s,]{5,}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Trail|Trl|Parkway|Pkwy|Square|Sq)\b/gi;

        const replaceAsync = async (str: string, regex: RegExp, type: string) => {
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
        scrubbed = await replaceAsync(scrubbed, phoneRegex, "PHONE");
        scrubbed = await replaceAsync(scrubbed, creditCardRegex, "CARD");
        scrubbed = await replaceAsync(scrubbed, addressRegex, "ADDRESS");

        return scrubbed;
    }

    private async redactUnstructuredEntities(text: string): Promise<string> {
        const doc = nlp(text);
        const people = doc.people().out("array");

        let scrubbed = text;

        const replaceEntities = async (entities: string[], type: string) => {
            const cleanedEntities = entities
                .map(e => e.replace(/[.,!?;:]+$/, "").trim())
                .filter(e => e.length > 0);
            
            const sortedEntities = Array.from(new Set(cleanedEntities)).sort((a, b) => b.length - a.length);
            for (const entity of sortedEntities) {
                const token = await this.storeInRedis(entity, type);
                const regex = new RegExp(`\\b${this.escapeRegExp(entity)}\\b`, "gi");
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
